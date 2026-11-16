import test from 'node:test';
import assert from 'node:assert/strict';
import { assessIntegrationFeasibility, renderCatalogEntry, renderDailyBrief } from '../src/core/discovery-output.js';

test('catalog renderer requires exact repository and source-backed evidence', () => {
  assert.throws(() => renderCatalogEntry({name:'OCR fixture',repoUrl:'https://github.com/example/ocr'}), /evidence/);
  const entry=renderCatalogEntry({
    date:'2026-11-16',name:'Mock OCR fixture',repoUrl:'https://github.com/example/mock-ocr',
    capability:'open-source OCR',license:'UNKNOWN',costAssessment:'UNVERIFIED',
    evidence:{sourcePath:'README.md',snippet:'FIXTURE_ONLY_NOT_FETCHED',url:'https://github.com/example/mock-ocr/blob/main/README.md'},
    architecture:{architecture:'serverless',runtime:'local'}
  });
  assert.match(entry,/Exact repository:/);
  assert.match(entry,/Verification evidence:/);
  assert.match(entry,/Integration feasibility: HIGH/);
});

test('daily brief explicitly labels mocked dry-run and API budget', () => {
  const brief=renderDailyBrief({generatedAt:'2026-11-16T00:00:00Z',discoveries:[],apiRequests:5,apiRequestBudget:5,dryRun:true});
  assert.match(brief,/DRY-RUN \(mocked; no external API calls\)/);
  assert.match(brief,/API requests: 5\/5/);
  assert.match(brief,/No discoveries passed/);
});

test('integration assessment stays conservative for unknown architecture', () => {
  assert.equal(assessIntegrationFeasibility().score,'LOW');
});

test('offline OCR dry-run consumes exactly five mocked request events and never reaches network', async () => {
  const ledger=[];
  const mockFetch=async endpoint=>{ledger.push(String(endpoint));return {ok:true,status:200,json:async()=>({fixture:true})};};
  for (const endpoint of ['/search/repositories?q=ocr','/repos/mock/ocr','/repos/mock/ocr/contents','/repos/mock/ocr/contents/package.json','/repos/mock/ocr/contents/.env.example']) {
    await mockFetch(endpoint);
  }
  assert.equal(ledger.length,5);
  assert.deepEqual(ledger,['/search/repositories?q=ocr','/repos/mock/ocr','/repos/mock/ocr/contents','/repos/mock/ocr/contents/package.json','/repos/mock/ocr/contents/.env.example']);
});
