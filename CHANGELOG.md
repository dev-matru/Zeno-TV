# Changelog

Each release is tagged in Git (`v1.0.0`…) and published on the GitHub releases page. A build made from any other commit shows its commit next to the version, in Customize → System information.

## Unreleased

- A music catalogue to download on the TV: ambient music by Scott Buckley, Chris Zabriskie, Lee Rosevere and HoliznaCC0, and field recordings of rain, sea, forests and night from Freesound, many by Félix Blume. All CC0 or CC BY 4.0, credited next to each track.
- Add tracks from your phone: the TV shows a QR code that opens a page on the home network, where you upload audio files or paste a link to a track or its page. The TV compresses WAV and AIFF files to Ogg Opus by itself.
- The player repeats the current track by default, or plays a playlist in order or shuffled. The playlist is every track, or the ones you pick in Music → Playlist. Tracks fade into one another, and a recording that repeats fades into its own beginning, so you never hear it restart. Mode, playlist and last track are kept.
- The synthesised rain and sea waves are gone, replaced by real recordings in the catalogue. The jazz lounge, piano, ambient and brown noise loops stay.
- A build without `.local/device-defaults.json` now creates the token its TV service needs, so online wallpapers, wake-on-LAN and music downloads work in every build.

## 1.0.0

The first public release. Earlier versions were private builds, never published.

- A home screen for Samsung Tizen TVs with three layouts: a grid of cards you can arrange, a dock and a list.
- Your apps as the TV lists them, with their own names and icons. A new Home is filled once with the installed apps; then you choose which stay and in what order.
- In the coloured card style, each card takes the main colour of its app's icon.
- Widgets: clock with time zones and a timer, weather, music, HDMI inputs. The timer alarm rings until you press a key, ten minutes at most.
- Six original music tracks (jazz lounge, piano, ambient, rain, sea waves, brown noise), plus your own from `.local/personal/music/`.
- HDMI devices as tiles, with wake-on-LAN for a PC.
- Fourteen photographs as backgrounds, with text and glass that adapt to each one.
- 30 languages.
- Personal fonts, logos, photos and music from a private folder that never reaches Git.
