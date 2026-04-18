#!/bin/bash
# Fix signing config, NDK, and R8 mapping after expo prebuild --clean
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
python3 -c "
with open('build.gradle') as f: content = f.read()

# Add release signing config if missing
if 'signingConfigs.release' not in content:
    content = content.replace(
        '''        keyPassword 'android'
        }
    }''',
        '''        keyPassword 'android'
        }
        release {
            storeFile file('../../undercut-release.keystore')
            storePassword 'A#@\$gfa!@#fdsdfasgadfhyg'
            keyAlias 'undercut'
            keyPassword 'A#@\$gfa!@#fdsdfasgadfhyg'
        }
    }''')
    import re
    content = re.sub(
        r'(release \{[^}]*?)signingConfig signingConfigs\.debug',
        r'\1signingConfig signingConfigs.release',
        content,
        count=1
    )
    content = content.replace('            // Caution! In production, you need to generate your own keystore file.\n            // see https://reactnative.dev/docs/signed-apk-android.\n', '')

# Note: R8 mapping file is generated automatically when minifyEnabled=true
# The mapping.txt will be at android/app/build/outputs/mapping/release/mapping.txt

with open('build.gradle', 'w') as f: f.write(content)
print('Signing + R8 mapping config fixed')
"

# Set SDK path
echo "sdk.dir=/opt/android-sdk" > "$DIR/android/local.properties"
echo "Android build config fixed: NDK 27, release signing, R8 mapping, SDK path"
