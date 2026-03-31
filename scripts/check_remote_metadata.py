#!/usr/bin/env python3
"""Check if remote data has changed by comparing ETag and Last-Modified headers."""

import os
import json
import sys

def main():
    meta_file = os.environ.get('META_FILE')
    if not meta_file:
        print('Error: META_FILE environment variable is not set', file=sys.stderr)
        sys.exit(1)
    
    etag = os.environ.get('REMOTE_ETAG') or ''
    lm = os.environ.get('REMOTE_LASTMOD') or ''
    
    if os.path.exists(meta_file):
        with open(meta_file) as f:
            j = json.load(f)
        if etag and j.get('etag') == etag:
            print('No change: ETag matches')
            sys.exit(2)
        if lm and j.get('last_modified') == lm:
            print('No change: Last-Modified matches')
            sys.exit(2)
    
    print('Changed or no previous metadata, continue')

if __name__ == '__main__':
    main()
