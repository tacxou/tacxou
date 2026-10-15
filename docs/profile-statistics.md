# Profile statistics

The **Update profile statistics** workflow generates eight SVGs daily at 05:43 UTC
and on manual runs: activity and languages, English and French, light and dark.
The profile loads these files from this repository. No external card-rendering
service receives the private token or GitHub data.

## Enable private statistics

1. Create a dedicated **classic personal access token** for `tacxou` at
   <https://github.com/settings/tokens/new>, with `repo` and `read:user` scopes
   and an expiration date. These are the scopes documented by the stats engine.
   The classic `repo` scope is broad and includes write access; this workflow
   uses the token only for reads. Use a dedicated token and renew/revoke it here.
2. If an organization requires SSO, authorize the token for that organization.
   Organization policies can also block classic tokens: only accessible data
   can be included. A fine-grained token is not equivalent for this engine:
   its documented limitation is public-only commit totals.
3. In <https://github.com/tacxou/tacxou/settings/secrets/actions>, add a repository
   secret named **`PROFILE_STATS_TOKEN`** containing the token.
   Do not put it in the README, a repository file, an image URL, or a chat message.
4. Open <https://github.com/tacxou/tacxou/actions/workflows/stats.yml> and choose
   **Run workflow** on `main`, or wait for the next scheduled run.
5. Check the run summary: it explicitly says whether the dedicated token was used.
   The scope note below the cards updates automatically after a successful run.

The normal `GITHUB_TOKEN` is used to commit images. It does not grant this
repository access to your other private repositories. Without the dedicated
secret, generation remains public-only and the README says so. An invalid or
expired dedicated token fails the update, preserving the last successful cards.

## What the numbers mean

- Commits: all-time commits returned by GitHub's search API for `tacxou`.
- Pull requests and issues: the account totals visible to the token.
- Contributed-to repositories: the past year, including owned repositories.
- Stars and languages: repositories where the account is an owner, organization
  member, or collaborator, subject to visibility and the engine's API limits.
- Languages: repository code volume, including code written by teammates.
  They do not measure personal working time or individual authorship.
- Private coverage depends on token permissions and organization policies;
  it is not a guarantee that every repository is counted.
- The trophy cards use their existing separate public-data workflow.

## Data published

Only the rendered aggregate statistics and language shares are committed.
Raw API data, repository lists, client names and source code are not saved.
Upstream API logs are suppressed, and failure messages are generic to keep
private responses out of public workflow logs. All cards are validated before
publication; failed runs keep the previous set. Published SVGs remain in Git
history, so revoking a token stops future access but does not erase past totals.

The rendering engine is pinned to `@stats-organization/github-readme-stats-core`
2.2.1, with transitive versions fixed in `package-lock.json`.

References:
- <https://github-stats-extended.vercel.app/frontend/docs/deploy/>
- <https://github-stats-extended.vercel.app/frontend/docs/cards/stats/>
- <https://github-stats-extended.vercel.app/frontend/docs/cards/top-languages/>

## Profile views and branding

The visible English/French view badges are served from `assets/badges/`, so a
counter-service outage cannot replace the visible image with a broken badge.
The separate **Update profile view badges** workflow refreshes them daily at
05:53 UTC and retains the last successful value on failure.

Komarev's documented `style=pixel` counter remains in each README to keep
recording requests while the visible badge is cached. Counts are approximate
image hits, not unique visitors: GitHub's image proxy, bots and the daily refresh
request affect the total. This improves display reliability; an outage can
still interrupt counting. No counter is reset or artificially offset.

The FicSys badge embeds the supplied white PNG mark directly in its SVG, with
no external logo or badge service dependency.

Counter documentation: <https://github.com/antonkomarev/github-profile-views-counter>
