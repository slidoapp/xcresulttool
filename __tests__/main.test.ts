import * as cp from 'child_process'
import * as github from '@actions/github'
import * as os from 'os'
import * as path from 'path'
import * as process from 'process'
import {beforeAll, expect, test} from '@jest/globals'
import {promises} from 'fs'
const {readFile, writeFile} = promises
import {Formatter, FormatterOptions} from '../src/formatter'
import {getXcodeVersion} from '../src/xcode'

let expectedResultsDir = '__tests__/data'

beforeAll(async () => {
  const xcodeVersion = await getXcodeVersion()
  if (xcodeVersion < 16) {
    expectedResultsDir = path.join(expectedResultsDir, 'legacy')
  }
})

test('Example.xcresult', async () => {
  const bundlePath = '__tests__/data/Example.xcresult'
  const formatter = new Formatter(bundlePath)
  const report = await formatter.format()
  const reportText = `${report.reportSummary}\n${report.reportDetail}`

  const outputPath = path.join(os.tmpdir(), 'Example.md')
  await writeFile(outputPath, reportText)
  // await writeFile(path.join(expectedResultsDir, 'Example.md'), reportText)
  expect((await readFile(outputPath)).toString()).toBe(
    (await readFile(path.join(expectedResultsDir, 'Example.md'))).toString()
  )
})

test('Example.xcresult', async () => {
  const bundlePath = '__tests__/data/Example.xcresult'
  const formatter = new Formatter(bundlePath)
  const report = await formatter.format({
    showPassedTests: false,
    showCodeCoverage: true
  })
  const reportText = `${report.reportSummary}\n${report.reportDetail}`

  const outputPath = path.join(os.tmpdir(), 'ExampleOnlyFailures.md')
  await writeFile(outputPath, reportText)
  // await writeFile(path.join(expectedResultsDir, 'ExampleOnlyFailures.md'), reportText)
  expect((await readFile(outputPath)).toString()).toBe(
    (
      await readFile(path.join(expectedResultsDir, 'ExampleOnlyFailures.md'))
    ).toString()
  )
})

test('KeychainAccess.xcresult', async () => {
  const bundlePath = '__tests__/data/KeychainAccess.xcresult'
  const formatter = new Formatter(bundlePath)
  const report = await formatter.format()
  const reportText = `${report.reportSummary}\n${report.reportDetail}`

  const outputPath = path.join(os.tmpdir(), 'KeychainAccess.md')
  await writeFile(outputPath, reportText)
  // await writeFile(path.join(expectedResultsDir, 'KeychainAccess.md'), reportText)
  expect((await readFile(outputPath)).toString()).toBe(
    (
      await readFile(path.join(expectedResultsDir, 'KeychainAccess.md'))
    ).toString()
  )
})

test('KeychainAccess.xcresult', async () => {
  const bundlePath = '__tests__/data/KeychainAccess.xcresult'
  const formatter = new Formatter(bundlePath)
  const report = await formatter.format({
    showPassedTests: false,
    showCodeCoverage: true
  })
  const reportText = `${report.reportSummary}\n${report.reportDetail}`

  const outputPath = path.join(os.tmpdir(), 'KeychainAccessOnlyFailures.md')
  await writeFile(outputPath, reportText)
  // await writeFile(path.join(expectedResultsDir, 'KeychainAccessOnlyFailures.md'), reportText)
  expect((await readFile(outputPath)).toString()).toBe(
    (
      await readFile(
        path.join(expectedResultsDir, 'KeychainAccessOnlyFailures.md')
      )
    ).toString()
  )
})

test('TAU.xcresult', async () => {
  const bundlePath = '__tests__/data/TAU.xcresult'
  const formatter = new Formatter(bundlePath)
  const report = await formatter.format()
  const reportText = `${report.reportSummary}\n${report.reportDetail}`

  const outputPath = path.join(os.tmpdir(), 'TAU.md')
  await writeFile(outputPath, reportText)
  // await writeFile(path.join(expectedResultsDir, 'TAU.md'), reportText)
  expect((await readFile(outputPath)).toString()).toBe(
    (await readFile(path.join(expectedResultsDir, 'TAU.md'))).toString()
  )
})

test('Merged.xcresult', async () => {
  const bundlePath = '__tests__/data/Merged.xcresult'
  const formatter = new Formatter(bundlePath)
  const report = await formatter.format()
  const reportText = `${report.reportSummary}\n${report.reportDetail}`

  const outputPath = path.join(os.tmpdir(), 'Merged.md')
  await writeFile(outputPath, reportText)
  // await writeFile(path.join(expectedResultsDir, 'Merged.md'), reportText)
  expect((await readFile(outputPath)).toString()).toBe(
    (await readFile(path.join(expectedResultsDir, 'Merged.md'))).toString()
  )
})

test('Spaceship.xcresult', async () => {
  const bundlePath = '__tests__/data/Spaceship.xcresult'
  const formatter = new Formatter(bundlePath)
  const report = await formatter.format()
  const reportText = `${report.reportSummary}\n${report.reportDetail}`

  const outputPath = path.join(os.tmpdir(), 'Spaceship.md')
  await writeFile(outputPath, reportText)
  // await writeFile(path.join(expectedResultsDir, 'Spaceship.md'), reportText)
  expect((await readFile(outputPath)).toString()).toBe(
    (await readFile(path.join(expectedResultsDir, 'Spaceship.md'))).toString()
  )
})

test('TestResults.xcresult', async () => {
  const bundlePath = '__tests__/data/TestResults.xcresult'
  const formatter = new Formatter(bundlePath)
  const report = await formatter.format()
  const reportText = `${report.reportSummary}\n${report.reportDetail}`

  const outputPath = path.join(os.tmpdir(), 'TestResults.md')
  await writeFile(outputPath, reportText)
  // await writeFile(path.join(expectedResultsDir, 'TestResults.md'), reportText)
  expect((await readFile(outputPath)).toString()).toBe(
    (await readFile(path.join(expectedResultsDir, 'TestResults.md'))).toString()
  )
})

test('UhooiPicBook.xcresult', async () => {
  const bundlePath = '__tests__/data/UhooiPicBook.xcresult'
  const formatter = new Formatter(bundlePath)
  const report = await formatter.format()

  let root = ''
  if (process.env.GITHUB_REPOSITORY) {
    const pr = github.context.payload.pull_request
    const sha = (pr && pr.head.sha) || github.context.sha
    root = `${github.context.serverUrl}/${github.context.repo.owner}/${github.context.repo.repo}/blob/${sha}/`
  }
  const re = new RegExp(`${root}`, 'g')
  const reportText = `${report.reportSummary}\n${report.reportDetail}`.replace(
    re,
    ''
  )

  const outputPath = path.join(os.tmpdir(), 'UhooiPicBook.md')
  await writeFile(outputPath, reportText)
  // await writeFile(path.join(expectedResultsDir, 'UhooiPicBook.md'), reportText)
  expect((await readFile(outputPath)).toString()).toBe(
    (
      await readFile(path.join(expectedResultsDir, 'UhooiPicBook.md'))
    ).toString()
  )
})

test('Attachment.xcresult', async () => {
  const bundlePath = '__tests__/data/Attachment.xcresult'
  const formatter = new Formatter(bundlePath)
  const report = await formatter.format()
  const reportText = `${report.reportSummary}\n${report.reportDetail}`

  const outputPath = path.join(os.tmpdir(), 'Attachment.md')
  await writeFile(outputPath, reportText)
  // await writeFile(path.join(expectedResultsDir, 'Attachment.md'), reportText)
  expect((await readFile(outputPath)).toString()).toBe(
    (await readFile(path.join(expectedResultsDir, 'Attachment.md'))).toString()
  )
})

test('Coverage.xcresult', async () => {
  const bundlePath = '__tests__/data/Coverage.xcresult'
  const formatter = new Formatter(bundlePath)
  const report = await formatter.format()

  let root = ''
  if (process.env.GITHUB_REPOSITORY) {
    const pr = github.context.payload.pull_request
    const sha = (pr && pr.head.sha) || github.context.sha
    root = `${github.context.serverUrl}/${github.context.repo.owner}/${github.context.repo.repo}/blob/${sha}/`
  }
  const re = new RegExp(`${root}`, 'g')
  const reportText = `${report.reportSummary}\n${report.reportDetail}`.replace(
    re,
    ''
  )

  const outputPath = path.join(os.tmpdir(), 'Coverage.md')
  await writeFile(outputPath, reportText)
  // await writeFile(path.join(expectedResultsDir, 'Coverage.md'), reportText)
  expect((await readFile(outputPath)).toString()).toBe(
    (await readFile(path.join(expectedResultsDir, 'Coverage.md'))).toString()
  )
})

test('Coverage.xcresult', async () => {
  const bundlePath = '__tests__/data/Coverage.xcresult'
  const formatter = new Formatter(bundlePath)
  const report = await formatter.format({
    showPassedTests: true,
    showCodeCoverage: false
  })

  let root = ''
  if (process.env.GITHUB_REPOSITORY) {
    const pr = github.context.payload.pull_request
    const sha = (pr && pr.head.sha) || github.context.sha
    root = `${github.context.serverUrl}/${github.context.repo.owner}/${github.context.repo.repo}/blob/${sha}/`
  }
  const re = new RegExp(`${root}`, 'g')
  const reportText = `${report.reportSummary}\n${report.reportDetail}`.replace(
    re,
    ''
  )

  const outputPath = path.join(os.tmpdir(), 'HideCodeCoverage.md')
  await writeFile(outputPath, reportText)
  // await writeFile(path.join(expectedResultsDir, 'HideCodeCoverage.md'), reportText)
  expect((await readFile(outputPath)).toString()).toBe(
    (
      await readFile(path.join(expectedResultsDir, 'HideCodeCoverage.md'))
    ).toString()
  )
})

test('BuildError.xcresult', async () => {
  const bundlePath = '__tests__/data/BuildError.xcresult'
  const formatter = new Formatter(bundlePath)
  const report = await formatter.format()
  const reportText = `${report.reportSummary}\n${report.reportDetail}`

  const outputPath = path.join(os.tmpdir(), 'BuildError.md')
  await writeFile(outputPath, reportText)
  // await writeFile(path.join(expectedResultsDir, 'BuildError.md'), reportText)
  expect((await readFile(outputPath)).toString()).toBe(
    (await readFile(path.join(expectedResultsDir, 'BuildError.md'))).toString()
  )
})

test('LinkError.xcresult', async () => {
  const bundlePath = '__tests__/data/LinkError.xcresult'
  const formatter = new Formatter(bundlePath)
  const report = await formatter.format()
  const reportText = `${report.reportSummary}\n${report.reportDetail}`

  const outputPath = path.join(os.tmpdir(), 'LinkError.md')
  await writeFile(outputPath, reportText)
  // await writeFile(path.join(expectedResultsDir, 'LinkError.md'), reportText)
  expect((await readFile(outputPath)).toString()).toBe(
    (await readFile(path.join(expectedResultsDir, 'LinkError.md'))).toString()
  )
})

test('NoTests.xcresult', async () => {
  const bundlePath = '__tests__/data/NoTests.xcresult'
  const formatter = new Formatter(bundlePath)
  const report = await formatter.format()

  let root = ''
  if (process.env.GITHUB_REPOSITORY) {
    const pr = github.context.payload.pull_request
    const sha = (pr && pr.head.sha) || github.context.sha
    root = `${github.context.serverUrl}/${github.context.repo.owner}/${github.context.repo.repo}/blob/${sha}/`
  }
  const re = new RegExp(`${root}`, 'g')
  const reportText = `${report.reportSummary}\n${report.reportDetail}`.replace(
    re,
    ''
  )

  const outputPath = path.join(os.tmpdir(), 'NoTests.md')
  await writeFile(outputPath, reportText)
  // await writeFile(path.join(expectedResultsDir, 'NoTests.md'), reportText)
  expect((await readFile(outputPath)).toString()).toBe(
    (await readFile(path.join(expectedResultsDir, 'NoTests.md'))).toString()
  )
})

test('TestResults#669.xcresult', async () => {
  const bundlePath = '__tests__/data/TestResults#669.xcresult'
  const formatter = new Formatter(bundlePath)
  const report = await formatter.format()

  let root = ''
  if (process.env.GITHUB_REPOSITORY) {
    const pr = github.context.payload.pull_request
    const sha = (pr && pr.head.sha) || github.context.sha
    root = `${github.context.serverUrl}/${github.context.repo.owner}/${github.context.repo.repo}/blob/${sha}/`
  }
  const re = new RegExp(`${root}`, 'g')
  const reportText = `${report.reportSummary}\n${report.reportDetail}`.replace(
    re,
    ''
  )

  const outputPath = path.join(os.tmpdir(), 'NoTests.md')
  await writeFile(outputPath, reportText)
  // await writeFile(path.join(expectedResultsDir, 'TestResults#669.md'), reportText)
  expect((await readFile(outputPath)).toString()).toBe(
    (
      await readFile(path.join(expectedResultsDir, 'TestResults#669.md'))
    ).toString()
  )
})

test('test runs', () => {
  process.env['INPUT_PATH'] = '__tests__/data/Example.xcresult'
  process.env['INPUT_SHOW-PASSED-TESTS'] = 'true'
  process.env['INPUT_SHOW-CODE-COVERAGE'] = 'true'
  process.env['INPUT_UPLOAD-BUNDLES'] = 'true'
  const np = process.execPath
  const ip = path.join(__dirname, '..', 'lib', 'main.js')
  const options: cp.ExecFileSyncOptions = {
    env: process.env
  }
  console.log(cp.execFileSync(np, [ip], options).toString())
})
