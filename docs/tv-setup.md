# Put Zeno on a TV

Zeno is a Tizen web app. Samsung only installs apps signed with your own developer certificates, so it takes about an hour the first time. Updates take a minute after that.

The scripts were written for one TV (a Samsung S90D on Tizen 9). They check the model before touching anything. Expect to adjust them for another set.

## 1. Tools

Install the [Samsung TV SDK](https://developer.samsung.com/smarttv/develop/getting-started/setting-up-sdk/installing-tv-sdk.html) into `.local/tizen-sdk/`. The scripts use its command-line `tizen` tool and `sdb`.

## 2. Developer Mode

1. Put the TV and the computer on the same network.
2. On the TV open **Apps → App Settings**, then type **1 2 3 4 5** on the remote's number pad.
3. Turn **Developer Mode** on and enter the computer's local IP address.
4. Restart the TV completely (hold the power button until it reboots).

Then tell the scripts where the TV is:

```json
// .local/device.json
{"host": "192.168.1.50", "model": "QE55S90DATXXN"}
```

`model` is the model name your TV reports (`npm run tv:info` shows it). Commands that install or change something refuse to run on any other model.

## 3. Certificates

Create an author and a distributor certificate with Samsung's [Certificate Manager](https://developer.samsung.com/smarttv/develop/getting-started/setting-up-sdk/creating-certificates.html). The distributor certificate must include your TV's DUID (Menu → Support → Contact Samsung → Unique Device ID, or pick the connected TV in the wizard).

Put them in `.local/certificates/`:

```
.local/certificates/private/   author/distributor .p12 files, profiles.xml,
                               certificate-password.txt
.local/certificates/ca/        Samsung CA certificates
```

Back up the author certificate. Without it you can't update the installed app; you'd have to uninstall it and lose its settings.

## 4. Your own app identity

The repository uses placeholder ids (`ZenoTV0000.ZenoTV`). Generate your own package id with the SDK (ten letters and digits) and put it in `.local/personal/identity.json`:

```json
{"package": "Ab12Cd34Ef", "app": "ZenoTV", "signingProfile": "ZenoTV"}
```

`signingProfile` is the name of your profile in `profiles.xml`. Your build and every TV command then use these ids; the source files never need to change. Keep them the same from then on: a different id installs as a separate app, without your settings.

## 5. Build, install, open

The first time, record which TV this is. Later commands refuse to touch a different one:

```sh
python3 scripts/tv/native-home/run.py inspect
```

Then:

```sh
npm run package      # dist/ZenoTV.wgt, signed
npm run tv:install   # upload and install, then confirm it is in the app list
npm run tv:launch    # open it
```

On macOS, if the TV commands fail with "No route to host" while `ping` works, the Python you are using has no permission for the local network. Allow it in System Settings → Privacy & Security → Local Network, or run the scripts with another Python (for example Homebrew's).

## Optional: open Zeno with the Home button

See [scripts/tv/native-home](../scripts/tv/native-home/README.md). It changes a system setting, so read it fully first and keep the backup it creates.
