# Windows Samsung TV build, certificates and .wgt packaging

These are preparation instructions, not a record of a completed build or installation. They have not been executed with a Tizen SDK in this cloud environment. Validate command availability and Samsung extension requirements on the laptop before using them.

## Tool choice and target verification

You previously specified that the retired Eclipse-based Tizen Studio must not be installed. Use the current Visual Studio Code Tizen Extension and its Baseline SDK, Package Manager, Certificate Manager, Device Manager and CLI. What older Tizen Studio guides call building a web project and packaging a signed widget maps to the current extension's Build Project and the CLI workflow below. Do not install an older IDE just to match those screenshots. Live official documentation could not be retrieved here; consult current Samsung/Tizen instructions if tool names or screens differ.

1. Install VS Code and the Tizen Extension published by Tizen. Let its setup provision Baseline SDK resources.
2. Open Package Manager and install the Samsung TV web-development tools matching the **verified** device platform and model-group requirements. The current manifest has a 10.0 floor, and the earlier Device Manager screenshot reported `tv-10.0`; independently confirm the exact model's current TV Extension requirement. Install Samsung certificate support if it is a separate component.
3. Transfer this source tree to the laptop. The older `C:\Users\Omar\StreamTV` folder is a separate copy, not automatically updated by cloud edits. Preserve any local user media before transferring.
4. Open the folder containing `index.html` and `config.xml` in VS Code and select it as the Tizen working project.
5. For tests, install Node.js (Node 24 was validated here); Python 3 is needed for the structural audit and `npm start`. Run `npm ci`, `npm run check`, `npm test`, and `npm run test:browser`. Install a Playwright Chromium browser or set `CHROMIUM_PATH` as described in README.

## Preserve and select signing certificates

1. On the old PC, securely back up the existing Samsung author and distributor certificate files and their passwords. The previous certificate profile was named `IPTV`; the old screenshot placed its files under `C:\Users\Omar\SamsungCertificate\IPTV`. Verify the actual files on that PC. Do not upload certificates or passwords to chat or commit them.
2. On the laptop, use Samsung Certificate Manager to create/import a Samsung **TV** security profile using the existing author key. Import the existing distributor certificate if valid and authorized for this TV, or obtain an updated distributor certificate through Samsung's supported flow with the TV's DUID. Preserve the author identity for app updates. Public privilege level is the starting point for this app; do not request partner privileges as a workaround.
3. Obtain the connected device's DUID through the supported Device Manager/certificate flow. Confirm it is authorized in the distributor certificate. An IP address is not a DUID.
4. Select the imported profile as the active Tizen certificate in VS Code. Confirm certificate expiry and account status locally. A copy of a `.p12` file alone does not select or register a security profile on the new machine.
5. For an eventual physical connection, use official Developer Mode, set its host IP to the laptop's current LAN address, and restart the TV as Samsung directs. The old PC's address must not be reused blindly. Use Device Manager to connect; the new laptop and TV must have permitted network access. If the current tooling provides a Permit to install applications action, complete that supported authorization before deployment.

## Build and sign through the extension

With the working project and active Samsung profile selected, use **Build Project**. Inspect the build output to establish whether it produced web build output only or a signed `.wgt`; do not equate a successful JavaScript/web build with a signed installable package. If needed, use the CLI packaging step below. Check the installed extension's package command/help rather than guessing a menu item. Do not use Run Project until you intend to install and launch on the selected target; this audit has not done so.

## CLI staging and packaging (PowerShell)

Use the Tizen SDK CLI installed by the extension. If `Get-Command` cannot find it, use the SDK path shown in the extension and follow its supported PATH/tool invocation instructions. Do not download arbitrary executables.

```powershell
Get-Command tizen
Get-Command sdb
tizen build-web --help
tizen package --help
tizen security-profiles list
```

Confirm that your SDK supplies `build-web` for TV Web Applications. If it does not, install the matching Samsung TV web tools rather than switching to a .NET or native project.

Build from a clean staging directory to keep `node_modules`, tests, development scripts and certificates out of the widget. Run this from the **updated** source root:

```powershell
$projectRoot = (Get-Location).Path
$stagePath = Join-Path $env:TEMP ('StreamTV-package-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $stagePath | Out-Null
Copy-Item -LiteralPath (Join-Path $projectRoot 'index.html') -Destination $stagePath
Copy-Item -LiteralPath (Join-Path $projectRoot 'config.xml') -Destination $stagePath
foreach ($folder in @('css', 'js', 'assets')) {
    Copy-Item -LiteralPath (Join-Path $projectRoot $folder) -Destination $stagePath -Recurse
}

# Use the exact imported security-profile name shown by the CLI.
$signingProfile = 'IPTV'
Push-Location $stagePath
try {
    tizen build-web -- .
    if ($LASTEXITCODE -ne 0) { throw 'Tizen web build failed; review SDK diagnostics.' }
    if (-not (Test-Path '.buildResult')) { throw 'Expected build output missing; inspect CLI output.' }
    tizen package -t wgt -s $signingProfile -- .buildResult
    if ($LASTEXITCODE -ne 0) { throw 'Tizen signed packaging failed; review certificate/profile diagnostics.' }
    Get-ChildItem -Path .buildResult -Filter '*.wgt' -Recurse
} finally {
    Pop-Location
}
Write-Output "Staged files retained for review: $stagePath"
```

These are the conventional Tizen CLI command forms; the installed SDK's `--help` and actual diagnostics are authoritative. Do not continue past build/packaging errors. Keep the staging directory until the result has been reviewed. No existing project files are removed by this procedure.

## Review the artifact before deployment

A `.wgt` is ZIP-based. Inspect a copy with an archive viewer and confirm:

- `config.xml` and `index.html` are at the archive root, with the expected app/package ID and required platform version.
- `css/`, `js/` and `assets/mock-catalog.json` are present with paths matching the source imports.
- Samsung/Tizen author and distributor signature XML files are present (normally `author-signature.xml` and `signature1.xml`). Their presence alone is not cryptographic or device-authorization validation; the SDK/signing tools must also succeed.
- No `.p12`, `.pfx`, real credentials, private stream URLs, `node_modules` or test reports are included. Do not remove signed archive entries after signing; rebuild and sign again instead.

Keep `StreamDemo.StreamTV` / `StreamDemo` if updating the existing app. A changed ID creates a different app identity; a changed author certificate can prevent updates. Signing for a device requires valid Samsung certificates and the correct DUID, not just a syntactically valid manifest.

This procedure ends with review of a signed package. Installation, launch, remote checks, packaged ES-module loading and AVPlay decoding must be performed separately on the physical Samsung TV using [PLAYBACK-CHECKLIST.md](PLAYBACK-CHECKLIST.md). None are claimed complete here.
