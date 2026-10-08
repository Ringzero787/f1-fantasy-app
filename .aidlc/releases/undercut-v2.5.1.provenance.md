# Provenance — undercut 2.5.1 (uc-v2.5.1)

Collected by hand on 2026-10-08 because G13 held on exactly this evidence being absent, as it also
did for 2.5.0 and 2.4.3 (both of which shipped). The gate's evidence collector does not gather it
on this project, so **G13 still records `hold`** — this file answers the hold, it does not clear it.

## Artifacts and hashes

| artifact | sha256 | bytes |
|---|---|---|
| `undercut-2.5.1-vc70.aab` | `fb96bcbeb155da0b432ec0366b1abd4ba0878cb6fed4b04cbcd9a184f09f4d5c` | 75083748 |
| `undercut-2.5.1-vc70-amazon.apk` | `d6dfadc29a2f596b647198e28466684068d75f0f43708c709c0f15636094a3d0` | 101795818 |
| `undercut-2.5.1-build52.ipa` | `e6bff25111dc1083a9e8c6ae94c39c61a68faac1e578041fc3fa8d9f9ddcd397` | 27856681 |

All three on `/mnt/smb/share/undercut/`. The iOS one is also on the Mac at
`~/projects/f1-app/build/export/Undercut.ipa`.

## Signatures — every artifact is signed

- **AAB** (`jarsigner -verify -certs`): `CN=Nathan Shanks, OU=Mobile, O=Undercut`, SHA256withRSA,
  2048-bit. Certificate SHA-256 `70:EC:4C:19:A6:62:B7:30:21:47:86:B3:A2:F1:0F:D8:91:15:AD:4E:79:41:BA:73:44:F3:E1:76:50:16:CF:E7`
  — the **upload** key, which is correct: Play re-signs with its own
  (`3D:2B:59:DC:…:26:4F`, SHA-1 `45e235…5a5a`).
- **Amazon APK** (`apksigner verify --print-certs`): same certificate, SHA-1
  `b9e5550621db608f927dca7eb7ec283d725a98b8`. Nothing re-signs an Amazon APK, so this is the
  fingerprint that will ever be presented there.
- **IPA** (`codesign -dv` on the Mac): `Apple Distribution: Nathan Shanks (MWVD9BU5VW)` chaining
  through Apple WWDR to Apple Root CA, `TeamIdentifier=MWVD9BU5VW`. Embedded profile
  `fe08ac16-b61e-4cc5-8294-278b50b3e6b7` ("Undercut AppStore Distribution", regenerated
  2026-10-08), carrying `com.apple.developer.associated-domains`.

**Both fingerprints in `public/.well-known/assetlinks.json` are accounted for by the above**, which
is the thing that would otherwise fail silently: Play installs verify against `3D:2B…`, Amazon and
direct installs against `70:EC…`.

## Contents verified, not assumed

| check | AAB | Amazon APK | IPA |
|---|---|---|---|
| version | `versionCode 70`, `versionName 2.5.1` | `versionCode='70' versionName='2.5.1'` | `CFBundleShortVersionString 2.5.1`, `CFBundleVersion 52` |
| App Links | host + `/join` + `/join.html` + `autoVerify` in `base/manifest` | same, via `aapt2 dump xmltree` | signed entitlement `applinks:undercut.humannpc.com` |

The AAB manifest is **protobuf**, not binary AXML, so `aapt2 dump xmltree` and `strings -e S/-e l`
both read it as empty — that is a tooling artefact, not a missing attribute. Parse it as protobuf.

iOS upload to App Store Connect succeeded: `UPLOAD SUCCEEDED with no errors`, Delivery UUID
`35337f47-d399-4134-b948-4234c8fa121d`, 27856681 bytes transferred — byte-identical to the IPA above.

## What is still not evidenced

- **Reproducible-build hash: still absent.** These builds are not reproducible as configured
  (`expo prebuild --clean` + gradle + a timestamped archive), so there is no second hash to compare
  against. Claiming reproducibility would be false; this is a real gap, not a collection failure.
- **SBOM diff: absent.** `syft` is not installed on the build box, so no dependency delta since
  2.5.0 is on record. No dependency or lockfile changed in this release (`git diff uc-v2.5.0..HEAD`
  touches no `package.json` or lockfile), which bounds the risk but is not an SBOM.
