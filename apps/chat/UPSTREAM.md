# Upstream

`apps/chat` is [basecamp/once-campfire](https://github.com/basecamp/once-campfire) (MIT, see `MIT-LICENSE`),
vendored at commit `11d3fb9ce01faad3384807563053ba86126f747e`, with Novawerk's changes on top.

Keep Novawerk changes in new files where possible (`app/assets/stylesheets/zz_novawerk.css`,
`app/models/novawerk_sso*`, `app/controllers/novawerk_sso_controller.rb`) and small edits to
upstream templates and controllers, so updates apply cleanly. Novawerk sign-in touches the
sessions, first run, join code, users, profile, avatar and closed-room controllers and views,
each behind `NovawerkSso.configured?` (`docs/novawerk-sso.md`).

Not vendored: upstream `test/` (51 MB of fixtures) and `.github/`. Run upstream's tests in a
clone of upstream.

## Updating

```bash
git clone https://github.com/basecamp/once-campfire /tmp/campfire
git -C /tmp/campfire diff 11d3fb9ce01faad3384807563053ba86126f747e <new-commit> | git apply -3 --directory=apps/chat --exclude='test/*' --exclude='.github/*'
```

Then change the commit above to `<new-commit>`.
