#!/usr/bin/env python3
"""Rebuild the downloadable offline ZIP using only Python's standard library.

Each page is written as one self-contained HTML file (styles and scripts
embedded), so the unzipped folder works from file:// with no network.
Run this after editing HTML/CSS/JS; scripts/build.py runs it automatically.
"""
from pathlib import Path
import base64
import re
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED

from site_pages import PAGES, OFFLINE_NAME, OFFLINE_ZIP

ROOT = Path(__file__).resolve().parents[1]
SCRIPT_TAG = re.compile(r'<script src="([^"]+)" defer></script>\n?')


def inline_page(filename: str) -> str:
    html = (ROOT / filename).read_text(encoding='utf-8')
    scripts = SCRIPT_TAG.findall(html)
    html = SCRIPT_TAG.sub('', html)
    html = re.sub(
        r'<link rel="stylesheet" href="([^"]+)">',
        lambda m: '<style>\n' + (ROOT / m.group(1)).read_text(encoding='utf-8') + '\n</style>',
        html,
    )
    favicon = base64.b64encode((ROOT / 'assets/favicon.svg').read_bytes()).decode('ascii')
    html = html.replace('href="assets/favicon.svg"', 'href="data:image/svg+xml;base64,' + favicon + '"')
    # The offline pages embed the trusted source scripts. No remote script/asset
    # loading, fetch, media, or form submission is enabled.
    html = html.replace("script-src 'self'", "script-src 'unsafe-inline'")
    html = html.replace("style-src 'self' 'unsafe-inline'", "style-src 'unsafe-inline'")
    html = html.replace("img-src 'self' blob: data:", "img-src blob: data:")
    html = re.sub(
        r'<a\b[^>]*href="' + re.escape(OFFLINE_ZIP) + r'"[^>]*>.*?</a>',
        '<span class="site-offline-ready">オフライン版を使用中</span>',
        html, flags=re.S,
    )
    html = html.replace('オフライン版を事前に保存して、ZIPを解凍。<br>中の index.html をブラウザで開けば、ネット接続なしで使えます。',
                        'このフォルダを丸ごとコピーして、会場へ。<br>index.html をブラウザで開けば、ネット接続なしで使えます。')
    html = html.replace('公開ページの読み込みにはネット接続が必要です。通信のない会場では、事前に「オフライン版を保存」してください。',
                        'これはオフライン版です。このフォルダ内のHTMLだけで利用できます。')
    html = html.replace('公開ページの読み込みにはネット接続が必要です。<br>通信のない会場では、事前に「オフライン版を保存」してください。',
                        'これはオフライン版です。このフォルダ内のHTMLだけで利用できます。')
    inline_scripts = '\n'.join('<script>\n' + (ROOT / src).read_text(encoding='utf-8') + '\n</script>' for src in scripts)
    return html.replace('</body>', inline_scripts + '\n</body>')


def main() -> None:
    destination = ROOT / OFFLINE_ZIP
    destination.parent.mkdir(exist_ok=True)
    readme = f'''Event Studio 現場ポータル / オフライン版

1. このZIPをすべて解凍してください。
2. index.html をPC版EdgeまたはChromeで開いてください。
3. 使いたいツールを選びます。

インストール・ネット接続・アカウントは不要です。
{len(PAGES)}個のHTMLは同じフォルダのまま保管してください。
各HTMLはスタイルとスクリプトを内蔵しています。

■ 写真（スライドショー・画像を整える）
写真はPC内で処理し、元画像は変更しません。
ページ移動・再読み込み・終了で、選択と変換結果は引き継がれません。
画像変換から上映へ進むときは、画像を保存（ZIPなら解凍）し、
スライドショーでそのフォルダを選び直してください。

■ 進行表・チェックリスト・来場カウンター・抽選・サイネージ
入力した内容は、開いたブラウザの中に保存されます。
公開サイトで作った内容は自動では引き継がれません。
ホームの「まとめて書き出す」で保存したファイルを、
このオフライン版のホームで「ファイルから読み込む」と移せます。
共有PCで使ったあとは、ホームの「すべて削除」で消してください。

本番前にPCのスリープ・通知をオフにして、会場の画面でテストしてください。
'''
    with ZipFile(destination, 'w', compression=ZIP_DEFLATED, compresslevel=9) as archive:
        def write(name: str, text: str) -> None:
            # Fixed timestamp: the same source always produces the same ZIP.
            info = ZipInfo(f'{OFFLINE_NAME}/{name}', date_time=(2026, 1, 1, 0, 0, 0))
            info.compress_type = ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            archive.writestr(info, text.encode('utf-8'), compresslevel=9)
        for page in PAGES:
            write(page, inline_page(page))
        write('README.txt', readme)
    print(f'Created: {destination} ({destination.stat().st_size:,} bytes)')


if __name__ == '__main__':
    main()
