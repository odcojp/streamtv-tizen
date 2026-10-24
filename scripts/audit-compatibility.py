"""Local structural checks, not Samsung SDK validation or a hardware certification."""
from pathlib import Path
from html.parser import HTMLParser
import json
import re
import sys
import xml.etree.ElementTree as ET

root = Path(__file__).resolve().parent.parent
failures = []
checks = 0

def check(condition, label):
    global checks
    checks += 1
    print(('PASS ' if condition else 'FAIL ') + label)
    if not condition:
        failures.append(label)

w = '{http://www.w3.org/ns/widgets}'
t = '{http://tizen.org/ns/widgets}'
manifest = ET.parse(root / 'config.xml').getroot()
app = manifest.find(t + 'application')
check(manifest.tag == w + 'widget', 'widget XML namespace')
check(bool(re.fullmatch(r'[A-Za-z0-9]{10}', app.attrib['package'])), '10-character alphanumeric package ID')
check(bool(re.fullmatch(re.escape(app.attrib['package']) + r'\.[A-Za-z0-9]{1,52}', app.attrib['id'])), 'application ID matches package prefix')
check(bool(re.fullmatch(r'\d+\.\d+', app.attrib['required_version'])), 'required_version syntax (not device-version verification)')
check(manifest.find(t + 'profile').attrib.get('name') == 'tv-samsung', 'Samsung TV profile')
privileges = {entry.attrib['name'] for entry in manifest.findall(t + 'privilege')}
check('http://tizen.org/privilege/internet' in privileges, 'internet privilege')
content = manifest.find(w + 'content').attrib['src']
check((root / content).is_file(), 'manifest entry asset exists')

class Resources(HTMLParser):
    def __init__(self):
        super().__init__()
        self.scripts = []
        self.assets = []
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        value = attrs.get('src') if tag in ('script', 'img', 'source') else attrs.get('href') if tag == 'link' else None
        if value:
            self.assets.append(value)
            if tag == 'script':
                self.scripts.append(value)

html = Resources()
html.feed((root / content).read_text())
check('$WEBAPIS/webapis/webapis.js' in html.scripts, 'Samsung runtime script declared')
check(html.scripts.index('$WEBAPIS/webapis/webapis.js') < html.scripts.index('js/app.js'), 'Samsung runtime script precedes app bootstrap')
for asset in html.assets:
    if not asset.startswith(('$WEBAPIS/', 'http:', 'https:', 'data:')):
        check((root / asset).is_file(), 'HTML asset: ' + asset)
for source in sorted((root / 'js').rglob('*.js')):
    text = source.read_text()
    for relative in re.findall(r"\bfrom\s+['\"]([^'\"]+)['\"]", text):
        check(relative.startswith('.') and (source.parent / relative).is_file(), 'import: ' + str(source.relative_to(root)) + ' -> ' + relative)
    for relative in re.findall(r"new URL\(['\"]([^'\"]+)['\"],\s*import\.meta\.url\)", text):
        check((source.parent / relative).is_file(), 'module-relative asset: ' + relative)
for source in (root / 'css').glob('*.css'):
    for relative in re.findall(r'url\([\'\"]?([^\)\'\"]+)', source.read_text()):
        if not relative.startswith(('data:', 'http:', 'https:', '#')):
            check((source.parent / relative).is_file(), 'CSS asset: ' + relative)
json.loads((root / 'assets/mock-catalog.json').read_text())
check(True, 'mock catalog JSON parses')
print('\nNetwork access entries (review scope; not a connectivity test):')
for entry in manifest.findall(w + 'access'):
    print(' ', entry.attrib)
print(f'\n{checks} structural checks; {len(failures)} failures. No SDK, signing or TV validation performed.')
sys.exit(bool(failures))
