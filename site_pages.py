"""Single list of the public pages, shared by the build and check scripts.

When you add a page: add it here, add its card to index.html, and add it to
the TOOLS list in assets/site.js (the header menu).
"""
PAGES = (
    "index.html",
    "slideshow.html",
    "signage.html",
    "qr.html",
    "rundown.html",
    "timer.html",
    "lottery.html",
    "counter.html",
    "checklist.html",
    "image-batch.html",
    "testpattern.html",
    "privacy.html",
)
OFFLINE_NAME = "event-studio-offline"
OFFLINE_ZIP = f"downloads/{OFFLINE_NAME}.zip"
