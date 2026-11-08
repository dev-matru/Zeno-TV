# Contributing

Thanks for wanting to help. Zeno is a small project that I work on in my free time, so a few rules keep it manageable.

## Issues

Pick one of the forms when you open an issue: a problem, a report about your TV, or an idea. Blank issues are turned off, because the forms ask for the things I always need (TV model, Zeno version, steps).

- One problem or idea per issue.
- Look through the open issues first. If yours is there, add a 👍 or what's different for you instead of a new issue.
- Never paste IP addresses, certificates, passwords, tokens or your `.local/` files.
- Setup questions are usually answered in [docs/tv-setup.md](docs/tv-setup.md).

## Pull requests

- For anything bigger than a fix, open an issue first, so we agree on it before you spend time.
- Keep a pull request to one change. Small ones get reviewed faster.
- Follow [docs/development.md](docs/development.md): code in `app/` is ES5, formatting is automatic, the checks must pass.
- Fill in the checklist in the pull request template.

## What fits

Zeno is meant to stay small, quiet and private. Changes that make it simpler, faster, easier with the remote or nicer to look at are welcome.

Not planned: accounts, ads, recommendations, tracking, anything that sends data somewhere without the user asking, and features that only work with one paid service.

## Assets and licences

Everything in the repository must be shareable under its licence. Don't add fonts, logos, photos, music or icons that you don't have the right to share, not even as examples. Personal files go in `.local/personal/`, which Git ignores; see [Personal assets](docs/development.md#personal-assets).

By sending a pull request you agree that your contribution is released under the [MIT License](LICENSE).
