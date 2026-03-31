#!/usr/bin/env python3
"""Save remote metadata (URL, ETag, Last-Modified, SHA256) to a JSON file."""

import json
import os
import sys

def main():
    meta_file = os.environ.get('META_FILE')
    if not meta_file:
        print('Error: META_FILE environment variable is not set', file=sys.stderr)
        sys.exit(1)
    
    meta = {
        'url': os.environ.get('INPUT_URL'),
        'etag': os.environ.get('REMOTE_ETAG') or None,
        'last_modified': os.environ.get('REMOTE_LASTMOD') or None,
        'sha256': os.environ.get('sha') or None
    }
    
    with open(meta_file, 'w') as f:
        json.dump(meta, f, indent=2)

if __name__ == '__main__':
    main()
