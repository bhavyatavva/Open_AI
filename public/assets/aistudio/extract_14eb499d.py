"""PDF parsing runs in a bounded subprocess; uploaded binaries are never served."""
import io
import json
import re
import subprocess
import sys
from pathlib import Path

MAX_BYTES = 25 * 1024 * 1024
MAX_TEXT = 100000


def chunks(text, page=None, offset=0):
    text = text.replace('\x00', '').strip()
    pieces = [text[i:i + 1800] for i in range(0, len(text), 1800)]
    return [{'id': f'S{offset+i+1}', 'page': page, 'text': p} for i, p in enumerate(pieces) if p.strip()]


def extract(filename, data):
    ext = Path(filename).suffix.lower()
    if ext not in {'.pdf', '.txt', '.md', '.markdown'}:
        raise ValueError('Upload a PDF, Markdown or UTF-8 text file.')
    if not data or len(data) > MAX_BYTES:
        raise ValueError('Files must be nonempty and no larger than 25 MB.')
    if ext == '.pdf':
        if not data.startswith(b'%PDF-'):
            raise ValueError('The file is not a valid PDF.')
        try:
            result = subprocess.run([sys.executable, '-m', 'server.extract'], input=data, capture_output=True, timeout=25)
            if result.returncode:
                raise ValueError('PDF could not be read. Use an unencrypted PDF with selectable text (maximum 100 pages).')
            sections = json.loads(result.stdout)
        except subprocess.TimeoutExpired as exc:
            raise ValueError('PDF extraction timed out. Try a smaller document.') from exc
    else:
        try:
            text = data.decode('utf-8-sig')
        except UnicodeDecodeError as exc:
            raise ValueError('Text files must use UTF-8 encoding.') from exc
        if re.search(r'[\x01-\x08\x0e-\x1f]', text):
            raise ValueError('Binary content is not supported.')
        sections = chunks(text)
    size = sum(len(x['text']) for x in sections)
    if size < 40:
        raise ValueError('No usable text found. Scanned PDFs need OCR before uploading; at least 40 text characters are required.')
    if size > MAX_TEXT:
        raise ValueError('Source exceeds 100,000 characters. Split it into chapters.')
    return sections


if __name__ == '__main__':
    import resource
    from pypdf import PdfReader
    resource.setrlimit(resource.RLIMIT_AS, (512 * 1024 * 1024,) * 2)
    resource.setrlimit(resource.RLIMIT_CPU, (20, 20))
    reader = PdfReader(io.BytesIO(sys.stdin.buffer.read(MAX_BYTES + 1)), strict=True)
    if reader.is_encrypted or len(reader.pages) > 100:
        sys.exit(1)
    result = []
    total = 0
    for i, page in enumerate(reader.pages):
        content = page.get_contents()
        if content and len(content.get_data()) > 10 * 1024 * 1024:
            sys.exit(1)
        text = page.extract_text() or ''
        total += len(text)
        if total > MAX_TEXT:
            sys.exit(1)
        result.extend(chunks(text, i + 1, len(result)))
    print(json.dumps(result))
