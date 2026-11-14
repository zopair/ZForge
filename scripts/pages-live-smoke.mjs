import { verifyPagesDeployment } from '../src/core/pages-deployment-verifier.js';

const baseUrl = process.env.GITHUB_PAGES_URL;
const expectedCommit = process.env.GITHUB_SHA;
const result = await verifyPagesDeployment({ baseUrl, expectedCommit });
process.stdout.write('GitHub Pages live smoke passed: ' + JSON.stringify(result) + '\n');
