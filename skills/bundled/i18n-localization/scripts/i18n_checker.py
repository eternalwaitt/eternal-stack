#!/usr/bin/env python3
"""
i18n Checker - Detects hardcoded strings and missing translations.
Scans for untranslated text in React, Vue, and Python files.
"""

import sys
import re
import json
from pathlib import Path

# Fix Windows console encoding for Unicode output
try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')
except AttributeError:
    pass  # Python < 3.7

# Patterns that indicate hardcoded strings (should be translated)
HARDCODED_PATTERNS = {
    'jsx': [
        # Text directly in JSX: <div>Hello World</div>
        r'>\s*([A-ZÀ-Ú][a-zà-ú\s]{3,40})\s*</',
        # JSX attribute strings: title="Welcome"
        r'(title|placeholder|label|alt|aria-label)="([A-ZÀ-Ú][a-zà-ú\s]{2,})"',
        # Button/heading text
        r'<(button|h[1-6]|p|span|label)[^>]*>\s*([A-ZÀ-Ú][a-zà-ú\s!?.,]{3,})\s*</',
    ],
    'vue': [
        # Vue template text
        r'>\s*[A-ZÀ-Ú][a-zà-ú\s]{3,40}\s*</',
        r'(placeholder|label|title)="[A-ZÀ-Ú][a-zà-ú\s]{2,}"',
    ],
    'python': [
        # print/raise with string literals
        r'(print|raise\s+\w+)\s*\(\s*["\']([A-ZÀ-Ú][^"\']{5,})["\']',
        # Flask flash messages
        r'flash\s*\(\s*["\']([A-ZÀ-Ú][^"\']{5,})["\']',
    ]
}

# Patterns that indicate proper i18n usage
I18N_PATTERNS = [
    r't\(["\']',         # t('key') - react-i18next
    r'useTranslation',   # React hook
    r'\$t\(',            # Vue i18n
    r'_\(["\']',         # Python gettext
    r'gettext\(',        # Python gettext
    r'useTranslations',  # next-intl
    r'FormattedMessage', # react-intl
    r'i18n\.',           # Generic i18n
]

def find_locale_files(project_path: Path) -> list:
    """Find translation/locale files."""
    patterns = [
        "**/locales/**/*.json",
        "**/translations/**/*.json",
        "**/lang/**/*.json",
        "**/i18n/**/*.json",
        "**/messages/*.json",
    ]
    files = []
    for pattern in patterns:
        files.extend(project_path.glob(pattern))
    return [f for f in files if 'node_modules' not in str(f)]

def check_locale_completeness(locale_files: list) -> dict:
    """Check if all locales have the same keys."""
    issues = []
    passed = []
    
    if not locale_files:
        return {'passed': [], 'issues': ["[!] No locale files found"]}
    
    # Group by parent folder (language)
    locales = {}
    for f in locale_files:
        if f.suffix == '.json':
            try:
                # Handle flattened structure: packages/i18n/messages/en.json
                if f.parent.name == 'messages':
                    lang = f.stem
                    namespace = 'default'
                else:
                    lang = f.parent.name
                    namespace = f.stem
                
                content = json.loads(f.read_text(encoding='utf-8'))
                if lang not in locales:
                    locales[lang] = {}
                locales[lang][namespace] = set(flatten_keys(content))
            except Exception as e:
                issues.append(f"[!] Error reading {f}: {e}")
                continue

    if len(locales) < 2:
        passed.append(f"[OK] Found {len(locale_files)} locale file(s). (Only {len(locales)} language detected)")
        return {'passed': passed, 'issues': issues}
    
    passed.append(f"[OK] Found {len(locales)} languages: {', '.join(locales.keys())}")
    
    # Compare keys across locales
    all_langs = sorted(list(locales.keys()))
    base_lang = 'en' if 'en' in locales else all_langs[0]

    all_namespaces = set()
    for lang in all_langs:
        all_namespaces.update(locales.get(lang, {}).keys())

    for namespace in sorted(all_namespaces):
        base_keys = locales[base_lang].get(namespace, set())
        for lang in all_langs:
            if lang == base_lang:
                continue

            other_keys = locales.get(lang, {}).get(namespace, set())
            missing = base_keys - other_keys
            if missing:
                issues.append(f"[X] {lang}/{namespace}: Missing {len(missing)} keys from {base_lang}")
            
            extra = other_keys - base_keys
            if extra:
                issues.append(f"[!] {lang}/{namespace}: {len(extra)} extra keys compared to {base_lang}")
                
    if not issues:
        passed.append("[OK] All locales have matching keys")
    
    return {'passed': passed, 'issues': issues}

def flatten_keys(d, prefix=''):
    """Flatten nested dict keys."""
    keys = set()
    if not isinstance(d, dict):
        return keys
    for k, v in d.items():
        new_key = f"{prefix}.{k}" if prefix else k
        if isinstance(v, dict):
            keys.update(flatten_keys(v, new_key))
        else:
            keys.add(new_key)
    return keys

def check_hardcoded_strings(project_path: Path) -> dict:
    """Check for hardcoded strings in code files efficiently."""
    issues = []
    passed = []
    
    # Find code files avoiding large directories
    extensions = {'.tsx', '.jsx', '.ts', '.js', '.vue', '.py'}
    exclude_dirs = {
        'node_modules', '.git', 'dist', 'build', '__pycache__', 
        'venv', '.next', '.turbo', '.mcp-cache', 'playwright-report',
        'test-results', '.serena', '.claude', '.cursor'
    }
    
    code_files = []
    
    def scan_dir(path):
        try:
            for item in path.iterdir():
                if item.is_dir():
                    if item.name not in exclude_dirs:
                        scan_dir(item)
                elif item.suffix in extensions:
                    code_files.append(item)
        except PermissionError:
            pass

    scan_dir(project_path)
    
    if not code_files:
        return {'passed': ["[!] No code files found"], 'issues': []}
        
    files_with_i18n = 0
    files_with_hardcoded = 0
    hardcoded_examples = []
    
    for file_path in code_files:
        try:
            # Skip very large files
            if file_path.stat().st_size > 1024 * 100: # 100KB limit
                continue
                
            content = file_path.read_text(encoding='utf-8', errors='ignore')
            
            # Check for i18n usage
            has_i18n = any(re.search(p, content) for p in I18N_PATTERNS)
            if has_i18n:
                files_with_i18n += 1
                
            # Skip if explicitly opted out or is an API route (often returns JSON)
            if 'app/api' in str(file_path):
                continue
                
            ext = file_path.suffix
            file_type = 'jsx' if ext in {'.tsx', '.jsx', '.ts', '.js'} else \
                        'vue' if ext == '.vue' else 'python'
            
            # Check for hardcoded strings
            patterns = HARDCODED_PATTERNS.get(file_type, [])
            hardcoded_found = False
            for pattern in patterns:
                matches = re.finditer(pattern, content)
                for match in matches:
                    text = match.group(0)
                    # Filter out obviously false positives
                    if not any(c.isalpha() for c in text):
                        continue
                    if 'use client' in text or 'use strict' in text:
                        continue
                    if '//@ts-ignore' in text:
                        continue
                    if 'from \'' in text or 'import ' in text:
                        continue

                    hardcoded_found = True
                    if len(hardcoded_examples) < 20:
                        hardcoded_examples.append(f"{file_path.relative_to(project_path)}: {text.strip()[:60]}...")
                    break
            
            if hardcoded_found:
                files_with_hardcoded += 1
        except (OSError, UnicodeError, ValueError) as exc:
            issues.append(f"[!] Failed to scan {file_path}: {exc}")
            continue
            
    passed.append(f"[OK] Analyzed {len(code_files)} code files")
    if files_with_i18n > 0:
        passed.append(f"[OK] {files_with_i18n} files use i18n")
        
    if files_with_hardcoded > 0:
        issues.append(f"[X] {files_with_hardcoded} files may have hardcoded strings")
        for ex in hardcoded_examples:
            issues.append(f"  → {ex}")
    else:
        passed.append("[OK] No obvious hardcoded strings detected")
        
    return {'passed': passed, 'issues': issues}

def main():
    target = sys.argv[1] if len(sys.argv) > 1 else "."
    project_path = Path(target)
    
    print("\n" + "=" * 60)
    print(" i18n CHECKER - Internationalization Audit")
    print("=" * 60 + "\n")
    
    # Check locale files
    locale_files = find_locale_files(project_path)
    locale_result = check_locale_completeness(locale_files)
    
    # Check hardcoded strings
    code_result = check_hardcoded_strings(project_path)
    
    # Print results
    print("[LOCALE FILES]")
    print("-" * 40)
    for item in locale_result['passed']:
        print(f"  {item}")
    for item in locale_result['issues']:
        print(f"  {item}")
        
    print("\n[CODE ANALYSIS]")
    print("-" * 40)
    for item in code_result['passed']:
        print(f"  {item}")
    for item in code_result['issues']:
        print(f"  {item}")
        
    # Summary
    critical_issues = sum(1 for i in locale_result['issues'] + code_result['issues'] if i.startswith("[X]"))
    
    print("\n" + "=" * 60)
    if critical_issues == 0:
        print("[OK] i18n CHECK: PASSED")
        sys.exit(0)
    else:
        print(f"[X] i18n CHECK: {critical_issues} issues found")
        sys.exit(1)

if __name__ == "__main__":
    main()
