#!/bin/bash
# Fix signing config, NDK, and R8 mapping after expo prebuild --clean
#
# The Undercut release keystore password is not in this public repo: it comes
# from UC_KEYSTORE_PASSWORD in the environment or the untracked, owner-only
# .signing.env at the repo root (KEY=VALUE lines, parsed, never sourced).
set -e
DIR="$(cd "$(dirname "$0")/.." && pwd)"
GP="$DIR/android/gradle.properties"

# Ensure final newline on gradle.properties (prebuild often omits it)
sed -i -e '$a\' "$GP"

# Fix any concatenated lines (e.g. buildToolsVersion=36.0.0android.ndkVersion=...)
sed -i 's/\([0-9]\)android\./\1\nandroid./g' "$GP"

# Add or update NDK version
if grep -q "android.ndkVersion" "$GP"; then
  sed -i 's/android.ndkVersion=.*/android.ndkVersion=27.1.12297006/' "$GP"
else
  echo "android.ndkVersion=27.1.12297006" >> "$GP"
fi

# Fix signing and enable R8 mapping in app/build.gradle
cd "$DIR/android/app"
python3 - "$DIR" <<'PY'
import os
import re
import sys

root = sys.argv[1]

def signing_env(path):
    try:
        with open(path) as f:
            lines = f.read().splitlines()
    except FileNotFoundError:
        return {}
    return {l.split('=', 1)[0].strip(): l.split('=', 1)[1].strip()
            for l in lines if '=' in l and not l.lstrip().startswith('#')}

pw = os.environ.get('UC_KEYSTORE_PASSWORD') or signing_env(os.path.join(root, '.signing.env')).get('UC_KEYSTORE_PASSWORD')
if not pw:
    sys.exit('fix-android-build: no UC_KEYSTORE_PASSWORD (set it in the environment or in .signing.env at the repo root)')
if "'" in pw or '\\' in pw or '\n' in pw:
    sys.exit('fix-android-build: the keystore password cannot contain quotes, backslashes or newlines')

with open('build.gradle') as f:
    content = f.read()

# Add release signing config if missing
if 'signingConfigs.release' not in content:
    content = content.replace(
        """        keyPassword 'android'
        }
    }""",
        f"""        keyPassword 'android'
        }}
        release {{
            storeFile file('../../undercut-release.keystore')
            storePassword '{pw}'
            keyAlias 'undercut'
            keyPassword '{pw}'
        }}
    }}""")
    content = re.sub(
        r'(release \{[^}]*?)signingConfig signingConfigs\.debug',
        r'\1signingConfig signingConfigs.release',
        content,
        count=1
    )
    content = content.replace('            // Caution! In production, you need to generate your own keystore file.\n            // see https://reactnative.dev/docs/signed-apk-android.\n', '')

# Note: R8 mapping file is generated automatically when minifyEnabled=true
# The mapping.txt will be at android/app/build/outputs/mapping/release/mapping.txt

with open('build.gradle', 'w') as f:
    f.write(content)
print('Signing + R8 mapping config fixed')
PY

# Set SDK path
echo "sdk.dir=/opt/android-sdk" > "$DIR/android/local.properties"
echo "Android build config fixed: NDK 27, release signing, R8 mapping, SDK path"
