# GitHub Pages Deployment Design

## Goal

Publish the Debtrank web application at
`https://lastch1ld.github.io/debtrank-globe/` and automatically refresh the
site after changes reach `master`.

## Deployment architecture

Use a dedicated GitHub Actions workflow rather than committing generated
assets. The workflow will:

1. run after the existing CI workflow succeeds on `master`;
2. install the web package with `npm ci`;
3. build the Vite application;
4. upload `web/dist` as the GitHub Pages artifact;
5. deploy that artifact through GitHub's supported Pages action.

The workflow receives only the permissions required to read repository
contents, publish Pages artifacts, and obtain the deployment identity token.
Deployments are serialized so a newer `master` build supersedes an older one
without allowing two deployments to race.

## Repository subpath support

GitHub serves this project below `/debtrank-globe/`, not at the domain root.
Vite will therefore use `/debtrank-globe/` as its production base path while
retaining `/` during local development.

Runtime network snapshots must be loaded relative to Vite's `BASE_URL`.
`loadYearData` will build URLs such as
`/debtrank-globe/data/network/2025.json` in production and
`/data/network/2025.json` in local development.

## Existing CI

The existing CI workflow remains responsible for Python model tests and the
web typecheck/test/build suite. Pages deployment will depend on a successful CI
run instead of duplicating the model job. Pull requests will continue to run CI
without deploying.

## Scope

Included:

- Vite production base-path configuration;
- subpath-safe static data loading;
- automated GitHub Pages deployment from `master`;
- focused tests for the base-path contract;
- a README link to the live application.

Excluded:

- a backend or server runtime;
- custom domains;
- analytics;
- changes to financial models or visualization behavior;
- public references to private projects.

## Verification

The implementation is complete when:

- local development retains the root base path;
- production builds emit `/debtrank-globe/` asset URLs;
- network snapshot URLs use `import.meta.env.BASE_URL`;
- tests, lint, TypeScript, and the Vite production build pass;
- the Pages workflow completes successfully on GitHub;
- the published URL returns the application and a historical network JSON
  file loads successfully.
