import * as os from 'os'
import * as path from 'path'
import {afterEach, beforeEach, expect, jest, test} from '@jest/globals'
import {promises} from 'fs'
const {mkdir, mkdtemp, readFile, rm, writeFile} = promises
import {Formatter, FormatterOptions} from '../src/formatter'
import {Parser} from '../src/parser'

// Output of `xcresulttool get test-results tests` and `get build-results` for
// the same result bundle (Swift Testing, parameterized tests, retries, skipped
// and expected failures), read by Xcode 26 (schema 0.1.0) and Xcode 27
// (schema 0.4.0). Formatting does not depend on the installed Xcode version.
const dataDir = '__tests__/data/modern'

async function readJSON(fileName: string): Promise<unknown> {
  return JSON.parse((await readFile(path.join(dataDir, fileName))).toString())
}

const noTests = {devices: [], testNodes: [], testPlanConfigurations: []}

async function formatModern(
  tests: unknown,
  buildResults: unknown,
  options: FormatterOptions = new FormatterOptions()
): Promise<Awaited<ReturnType<Formatter['formatModern']>>> {
  jest
    .spyOn(Parser.prototype, 'parseModernTests')
    .mockResolvedValue(tests as never)
  jest
    .spyOn(Parser.prototype, 'parseBuildResults')
    .mockResolvedValue(buildResults as never)
  jest
    .spyOn(Parser.prototype, 'exportCodeCoverage')
    .mockRejectedValue(new Error('No coverage data'))

  return await new Formatter('Sample.xcresult').formatModern(options)
}

const expectedAnnotations = [
  {
    path: 'Tests/SampleTests/XCTests.swift',
    start_line: 6,
    end_line: 6,
    annotation_level: 'failure',
    message:
      'XCTAssertEqual failed: ("3") is not equal to ("4") - math is broken',
    title: 'SampleTests/CalculatorXCTests/testAddFails()'
  },
  {
    path: 'Tests/SampleTests/XCTests.swift',
    start_line: 13,
    end_line: 13,
    annotation_level: 'failure',
    message: 'XCTAssertTrue failed - first',
    title: 'SampleTests/CalculatorXCTests/testMultipleFailures()'
  },
  {
    path: 'Tests/SampleTests/XCTests.swift',
    start_line: 14,
    end_line: 14,
    annotation_level: 'failure',
    message: 'XCTAssertEqual failed: ("a") is not equal to ("b") - second',
    title: 'SampleTests/CalculatorXCTests/testMultipleFailures()'
  },
  {
    // Failed for 2 arguments and on retry, reported once
    path: 'Tests/SampleTests/SwiftTests.swift',
    start_line: 6,
    end_line: 6,
    annotation_level: 'failure',
    message: 'Expectation failed: isEven(n)\nn → ()',
    title: 'SampleTests/EvenTests/evenNumbers(n:)'
  },
  {
    path: 'Tests/SampleTests/SwiftTests.swift',
    start_line: 7,
    end_line: 7,
    annotation_level: 'failure',
    message: 'Expectation failed: add(2, 2) == 5\nadd(2, 2) → 4',
    title: 'SampleTests/EvenTests/failing()'
  }
]

const originalWorkspace = process.env.GITHUB_WORKSPACE

beforeEach(() => {
  delete process.env.GITHUB_WORKSPACE
})

afterEach(() => {
  jest.restoreAllMocks()
  if (originalWorkspace === undefined) {
    delete process.env.GITHUB_WORKSPACE
  } else {
    process.env.GITHUB_WORKSPACE = originalWorkspace
  }
})

test('SwiftTesting (schema 0.4.0)', async () => {
  const report = await formatModern(
    await readJSON('SwiftTesting.tests.schema-0.4.0.json'),
    await readJSON('SwiftTesting.build-results.json')
  )
  const reportText = `${report.reportSummary}\n${report.reportDetail}`

  // await writeFile(path.join(dataDir, 'SwiftTesting.md'), reportText)
  expect(reportText).toBe(
    (await readFile(path.join(dataDir, 'SwiftTesting.md'))).toString()
  )
  expect(report.testStatus).toBe('failure')
})

test('SwiftTesting (schema 0.1.0)', async () => {
  const report = await formatModern(
    await readJSON('SwiftTesting.tests.schema-0.1.0.json'),
    await readJSON('SwiftTesting.build-results.json')
  )
  const reportText = `${report.reportSummary}\n${report.reportDetail}`

  expect(reportText).toBe(
    (await readFile(path.join(dataDir, 'SwiftTesting.md'))).toString()
  )
  expect(report.testStatus).toBe('failure')
})

test('SwiftTesting only failures', async () => {
  const report = await formatModern(
    await readJSON('SwiftTesting.tests.schema-0.4.0.json'),
    await readJSON('SwiftTesting.build-results.json'),
    new FormatterOptions(false)
  )
  const reportText = `${report.reportSummary}\n${report.reportDetail}`

  expect(reportText).toContain('<code>testAddFails()</code>')
  expect(reportText).not.toContain('<code>testAddPasses()</code>')
})

test('SwiftTesting annotations (schema 0.4.0)', async () => {
  process.env.GITHUB_WORKSPACE = '/Users/runner/work/Sample'
  const report = await formatModern(
    await readJSON('SwiftTesting.tests.schema-0.4.0.json'),
    await readJSON('SwiftTesting.build-results.json')
  )

  expect(report.annotations).toEqual(expectedAnnotations)
})

test('SwiftTesting annotations (schema 0.1.0)', async () => {
  // Only file names are available, they are looked up in the workspace
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'workspace-'))
  try {
    const testsDir = path.join(workspace, 'Tests', 'SampleTests')
    await mkdir(testsDir, {recursive: true})
    await writeFile(path.join(testsDir, 'XCTests.swift'), '')
    await writeFile(path.join(testsDir, 'SwiftTests.swift'), '')
    process.env.GITHUB_WORKSPACE = workspace

    const report = await formatModern(
      await readJSON('SwiftTesting.tests.schema-0.1.0.json'),
      await readJSON('SwiftTesting.build-results.json')
    )

    expect(report.annotations).toEqual(expectedAnnotations)
  } finally {
    await rm(workspace, {recursive: true, force: true})
  }
})

test('BuildError (Xcode 27)', async () => {
  process.env.GITHUB_WORKSPACE = '/Users/runner/work/Sample'
  const report = await formatModern(
    noTests,
    await readJSON('BuildError27.build-results.json')
  )

  expect(report.testStatus).toBe('failure')
  expect(report.chapters).toHaveLength(0)
  expect(report.reportSummary).toContain(
    "Use of 'add' refers to instance method rather than global function 'add' in module 'Sample'<br><code>Tests/SampleTests/XCTests.swift:5:41</code>"
  )
  expect(report.annotations.slice(0, 2)).toEqual([
    expect.objectContaining({
      path: 'Tests/SampleTests/XCTests.swift',
      start_line: 5,
      title: 'Swift Compiler Error'
    }),
    expect.objectContaining({
      path: 'Tests/SampleTests/XCTests.swift',
      start_line: 6,
      title: 'Swift Compiler Error'
    })
  ])
})
