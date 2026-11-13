#!/usr/bin/env python3
"""Check public pages and package links. Python standard library only."""
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit, unquote
from zipfile import ZipFile
import re
import sys

from site_pages import PAGES, OFFLINE_NAME, OFFLINE_ZIP

ROOT = Path(__file__).resolve().parents[1]


class Page(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids = set()
        self.duplicates = []
        self.refs = []
        self.csp = ''
        self.titles = 0
        self.scripts = []

    def handle_starttag(self, tag, attributes):
        attrs = dict(attributes)
        if 'id' in attrs:
            if attrs['id'] in self.ids:
                self.duplicates.append(attrs['id'])
            self.ids.add(attrs['id'])
        for attr in ('href', 'src'):
            if attrs.get(attr):
                self.refs.append(attrs[attr])
        if tag == 'meta' and attrs.get('http-equiv', '').lower() == 'content-security-policy':
            self.csp = attrs.get('content', '')
        if tag == 'title':
            self.titles += 1
        if tag == 'script':
            self.scripts.append(attrs.get('src', ''))


def main() -> int:
    errors = []
    docs = {}
    for name in PAGES:
        path = ROOT / name
        if not path.is_file():
            errors.append(f'Missing: {name}')
            continue
        parser = Page(); parser.feed(path.read_text(encoding='utf-8')); docs[name] = parser
        if parser.duplicates:
            errors.append(f'{name}: duplicate IDs {parser.duplicates}')
        if parser.titles != 1:
            errors.append(f'{name}: expected one title')
        if "connect-src 'none'" not in parser.csp or "script-src 'self'" not in parser.csp:
            errors.append(f'{name}: unexpected public CSP')
        if '' in parser.scripts:
            errors.append(f'{name}: public page has inline scripts')
        for reference in parser.refs:
            url = urlsplit(reference)
            if url.scheme or url.netloc:
                continue
            if url.path.startswith('/'):
                errors.append(f'{name}: root-absolute URL is not project-path safe: {reference}')
                continue
            target = (path.parent / unquote(url.path)).resolve() if url.path else path
            if not target.is_relative_to(ROOT):
                errors.append(f'{name}: link escapes project: {reference}')
            elif not target.exists():
                errors.append(f'{name}: missing resource: {reference}')
            elif url.path and url.fragment and url.path in docs and unquote(url.fragment) not in docs[url.path].ids:
                errors.append(f'{name}: missing section in {url.path}: {reference}')
            if not url.path and url.fragment and unquote(url.fragment) not in parser.ids:
                errors.append(f'{name}: missing section: {reference}')
    # Every public page other than the home page must be reachable from the home page
    # and listed in the header menu (TOOLS in assets/site.js).
    if 'index.html' in docs:
        home_links = {urlsplit(ref).path for ref in docs['index.html'].refs}
        menu = (ROOT / 'assets/site.js').read_text(encoding='utf-8')
        for name in PAGES:
            if name == 'index.html':
                continue
            if name not in home_links:
                errors.append(f'index.html: no link to {name}')
            if name != 'privacy.html' and f"href: '{name}'" not in menu:
                errors.append(f'assets/site.js: {name} is missing from TOOLS (header menu)')
    # Scripts and styles are embedded into the offline pages, so they must not
    # contain a closing tag that would end the embedding element early.
    for asset in sorted((ROOT / 'assets').iterdir()):
        if asset.suffix in ('.js', '.css'):
            text = asset.read_text(encoding='utf-8')
            if re.search(r'</(script|style)', text, flags=re.I):
                errors.append(f'{asset.name}: contains a closing script/style tag')
            if re.search(r'\b(fetch|XMLHttpRequest|WebSocket|sendBeacon|EventSource)\s*\(', text):
                errors.append(f'{asset.name}: contains a network call')
    if not (ROOT / '.nojekyll').exists():
        errors.append('Missing .nojekyll')
    try:
        with ZipFile(ROOT / OFFLINE_ZIP) as archive:
            if archive.testzip():
                errors.append('Offline ZIP CRC validation failed')
            for name in PAGES:
                data = archive.read(f'{OFFLINE_NAME}/{name}').decode('utf-8')
                parsed = Page(); parsed.feed(data)
                if OFFLINE_ZIP in data:
                    errors.append(f'Offline {name}: recursive download link')
                if any(src for src in parsed.scripts):
                    errors.append(f'Offline {name}: non-embedded script')
                if 'rel="stylesheet"' in data:
                    errors.append(f'Offline {name}: non-embedded stylesheet')
                for reference in parsed.refs:
                    url = urlsplit(reference)
                    if url.scheme or url.netloc or not url.path:
                        continue
                    if url.path not in PAGES:
                        errors.append(f'Offline {name}: link leaves the offline folder: {reference}')
    except Exception as exc:
        errors.append(f'Offline ZIP: {exc}')
    if errors:
        print('\n'.join('ERROR: ' + error for error in errors))
        return 1
    print(f'OK: {len(docs)} pages; relative resources exist; IDs unique; CSP present; menu complete; offline ZIP valid.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
