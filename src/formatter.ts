import * as Image from './image'
import * as core from '@actions/core'
import * as github from '@actions/github'
import * as path from 'path'
import {getXcodeVersion} from './xcode'
import {glob} from 'glob'

import {
  Annotation,
  BuildLog,
  BuildResultsLog,
  TestCodeCoverage,
  TestDetail,
  TestDetails,
  TestFailure,
  TestFailureGroup,
  TestFailures,
  TestReport,
  TestReportChapter,
  TestReportChapterDetail,
  TestReportChapterSummary,
  TestReportSection,
  actionTestSummaries,
  actionTestSummary
} from './report'
import {
  anchorIdentifier,
  anchorNameTag,
  escapeHashSign,
  indentation
} from './markdown'

import {ActionTestActivitySummary} from '../dev/@types/ActionTestActivitySummary.d'
import {ActionTestFailureSummary} from '../dev/@types/ActionTestFailureSummary.d'
import {ActionTestMetadata} from '../dev/@types/ActionTestMetadata.d'
import {ActionTestPlanRunSummaries} from '../dev/@types/ActionTestPlanRunSummaries.d'
import {ActionTestSummary} from '../dev/@types/ActionTestSummary.d'
import {ActionTestSummaryGroup} from '../dev/@types/ActionTestSummaryGroup.d'
import {ActionTestableSummary} from '../dev/@types/ActionTestableSummary.d'
import {ActionsInvocationMetadata} from '../dev/@types/ActionsInvocationMetadata.d'
import {ActionsInvocationRecord} from '../dev/@types/ActionsInvocationRecord.d'
import {Device, TestNode, TestResult} from '../dev/@types/TestResults_Tests'
import {ActionRunDestinationRecord} from '../dev/@types/ActionRunDestinationRecord.d'
import {BuildResults} from '../dev/@types/BuildResults'

import {Activity} from './activity'
import {ActivityLogSection} from '../dev/@types/ActivityLogSection.d'
import {CodeCoverage, Convert} from './coverage'
import {Parser} from './parser'
import {exportAttachments} from './attachment'

const passedIcon = Image.testStatus('Success')
const failedIcon = Image.testStatus('Failure')
const skippedIcon = Image.testStatus('Skipped')
const expectedFailureIcon = Image.testStatus('Expected Failure')

const backIcon = Image.icon('back.png')
const testClassIcon = Image.icon('test-class.png')
const testMethodIcon = Image.icon('test-method.png')
const attachmentIcon = Image.icon('attachment.png')

export class Formatter {
  readonly summaries = ''
  readonly details = ''

  private bundlePath: string
  private parser: Parser

  constructor(bundlePath: string) {
    this.bundlePath = bundlePath
    this.parser = new Parser(this.bundlePath)
  }

  async format(
    options: FormatterOptions = new FormatterOptions()
  ): Promise<TestReport> {
    const xcodeVersion = await getXcodeVersion()
    if (xcodeVersion >= 16) {
      return this.formatModern(options)
    }

    // Fall back to legacy format
    const actionsInvocationRecord: ActionsInvocationRecord =
      await this.parser.parseLegacy()

    const testReport = new TestReport()

    if (actionsInvocationRecord.metadataRef) {
      const metadata: ActionsInvocationMetadata = await this.parser.parseLegacy(
        actionsInvocationRecord.metadataRef.id
      )

      testReport.entityName = metadata.schemeIdentifier?.entityName
      testReport.creatingWorkspaceFilePath = metadata.creatingWorkspaceFilePath
    }

    if (actionsInvocationRecord.actions) {
      for (const action of actionsInvocationRecord.actions) {
        if (action.buildResult.logRef) {
          const log: ActivityLogSection = await this.parser.parseLegacy(
            action.buildResult.logRef.id
          )
          const buildLog = new BuildLog(
            log,
            testReport.creatingWorkspaceFilePath
          )
          if (buildLog.content.length) {
            testReport.buildLog = buildLog
            testReport.testStatus = 'failure'
            for (const annotation of buildLog.annotations) {
              testReport.annotations.push(annotation)
            }
          }
        }
        if (action.actionResult) {
          if (action.actionResult.testsRef) {
            const testReportChapter = new TestReportChapter(
              action.schemeCommandName,
              action.runDestination,
              action.title
            )
            testReport.chapters.push(testReportChapter)

            const actionTestPlanRunSummaries: ActionTestPlanRunSummaries =
              await this.parser.parseLegacy(action.actionResult.testsRef.id)

            for (const summary of actionTestPlanRunSummaries.summaries) {
              for (const testableSummary of summary.testableSummaries) {
                const testSummaries: actionTestSummaries = []
                await this.collectTestSummaries(
                  testableSummary,
                  testableSummary.tests,
                  testSummaries
                )
                if (testableSummary.name) {
                  testReportChapter.sections[testableSummary.name] =
                    new TestReportSection(testableSummary, testSummaries)
                }
              }
            }

            if (action.actionResult.coverage) {
              try {
                const codeCoverage = Convert.toCodeCoverage(
                  await this.parser.exportCodeCoverage()
                )

                const testCodeCoverage = new TestCodeCoverage(codeCoverage)
                testReport.codeCoverage = testCodeCoverage
              } catch {
                // no-op
              }
            }
          }
        }
      }
    }

    class TestSummaryStats {
      passed = 0
      failed = 0
      skipped = 0
      expectedFailure = 0
      total = 0
    }
    type TestSummaryStatsGroup = {[key: string]: TestSummaryStats}
    const testSummary = {
      stats: new TestSummaryStats(),
      duration: 0,
      groups: {} as {[key: string]: TestSummaryStatsGroup}
    }

    for (const chapter of testReport.chapters) {
      const chapterSummary = new TestReportChapterSummary()
      chapter.summaries.push(chapterSummary)

      for (const [identifier, results] of Object.entries(chapter.sections)) {
        const detailGroup = results.details.reduce(
          (groups: {[key: string]: actionTestSummaries}, detail) => {
            const d = detail as actionTestSummary & {group?: string}
            if (d.group) {
              if (groups[d.group]) {
                groups[d.group].push(detail)
              } else {
                groups[d.group] = [detail]
              }
            }
            return groups
          },
          {}
        )

        const group: TestSummaryStatsGroup = {}
        for (const [identifier, details] of Object.entries(detailGroup)) {
          const [stats, duration] = details.reduce(
            ([stats, duration]: [TestSummaryStats, number], detail) => {
              const test = detail as ActionTestSummary
              if (test.testStatus) {
                switch (test.testStatus) {
                  case 'Success':
                    stats.passed++
                    break
                  case 'Failure':
                    stats.failed++
                    break
                  case 'Skipped':
                    stats.skipped++
                    break
                  case 'Expected Failure':
                    stats.expectedFailure++
                    break
                }

                stats.total++
              }

              if (test.duration) {
                duration = test.duration
              }
              return [stats, duration]
            },
            [new TestSummaryStats(), 0]
          )
          testSummary.stats.passed += stats.passed
          testSummary.stats.failed += stats.failed
          testSummary.stats.skipped += stats.skipped
          testSummary.stats.expectedFailure += stats.expectedFailure
          testSummary.stats.total += stats.total
          testSummary.duration += duration

          group[identifier] = {
            passed: stats.passed,
            failed: stats.failed,
            skipped: stats.skipped,
            expectedFailure: stats.expectedFailure,
            total: stats.total
          }
        }

        const groups = testSummary.groups
        groups[identifier] = group
      }

      chapterSummary.content.push('### Summary')

      chapterSummary.content.push('<table>')
      chapterSummary.content.push('<tr>')
      const header = [
        `<th>Total`,
        `<th>${passedIcon}&nbsp;Passed`,
        `<th>${failedIcon}&nbsp;Failed`,
        `<th>${skippedIcon}&nbsp;Skipped`,
        `<th>${expectedFailureIcon}&nbsp;Expected Failure`,
        `<th>:stopwatch:&nbsp;Time`
      ].join('')
      chapterSummary.content.push(header)

      chapterSummary.content.push('<tr>')

      let failedCount: string
      if (testSummary.stats.failed > 0) {
        failedCount = `<b>${testSummary.stats.failed}</b>`
      } else {
        failedCount = `${testSummary.stats.failed}`
      }
      const duration = testSummary.duration.toFixed(2)
      const cols = [
        `<td align="right" width="118px">${testSummary.stats.total}`,
        `<td align="right" width="118px">${testSummary.stats.passed}`,
        `<td align="right" width="118px">${failedCount}`,
        `<td align="right" width="118px">${testSummary.stats.skipped}`,
        `<td align="right" width="158px">${testSummary.stats.expectedFailure}`,
        `<td align="right" width="138px">${duration}s`
      ].join('')
      chapterSummary.content.push(cols)
      chapterSummary.content.push('</table>\n')

      chapterSummary.content.push('---\n')

      if (testSummary.stats.failed > 0) {
        testReport.testStatus = 'failure'
      } else if (testSummary.stats.passed > 0) {
        testReport.testStatus = 'success'
      }

      chapterSummary.content.push('### Test Summary')

      for (const [groupIdentifier, group] of Object.entries(
        testSummary.groups
      )) {
        const anchorName = anchorIdentifier(groupIdentifier)
        const anchorTag = anchorNameTag(`${groupIdentifier}_summary`)
        chapterSummary.content.push(
          `#### ${anchorTag}[${groupIdentifier}](${anchorName})\n`
        )

        const runDestination = chapter.runDestination
        chapterSummary.content.push(
          `- **Device:** ${runDestination.targetDeviceRecord.modelName}, ${runDestination.targetDeviceRecord.operatingSystemVersionWithBuildNumber}`
        )
        chapterSummary.content.push(
          `- **SDK:** ${runDestination.targetSDKRecord.name}, ${runDestination.targetSDKRecord.operatingSystemVersion}`
        )

        chapterSummary.content.push('<table>')
        chapterSummary.content.push('<tr>')
        const header = [
          `<th>Test`,
          `<th>Total`,
          `<th>${passedIcon}`,
          `<th>${failedIcon}`,
          `<th>${skippedIcon}`,
          `<th>${expectedFailureIcon}`
        ].join('')
        chapterSummary.content.push(header)

        for (const [identifier, stats] of Object.entries(group)) {
          chapterSummary.content.push('<tr>')
          const testClass = `${testClassIcon}&nbsp;${identifier}`
          const testClassAnchor = anchorNameTag(
            `${groupIdentifier}_${identifier}_summary`
          )
          const anchorName = anchorIdentifier(
            `${groupIdentifier}_${identifier}`
          )
          const testClassLink = `<a href="${anchorName}">${testClass}</a>`

          let failedCount: string
          if (stats.failed > 0) {
            failedCount = `<b>${stats.failed}</b>`
          } else {
            failedCount = `${stats.failed}`
          }
          const cols = [
            `<td align="left" width="368px">${testClassAnchor}${testClassLink}`,
            `<td align="right" width="80px">${stats.total}`,
            `<td align="right" width="80px">${stats.passed}`,
            `<td align="right" width="80px">${failedCount}`,
            `<td align="right" width="80px">${stats.skipped}`,
            `<td align="right" width="80px">${stats.expectedFailure}`
          ].join('')
          chapterSummary.content.push(cols)
        }
        chapterSummary.content.push('')
        chapterSummary.content.push('</table>\n')
      }

      chapterSummary.content.push('---\n')

      const testFailures = new TestFailures()
      const annotations: Annotation[] = []
      for (const [, results] of Object.entries(chapter.sections)) {
        const testResultSummaryName = results.summary.name

        const detailGroup = results.details.reduce(
          (groups: {[key: string]: actionTestSummaries}, detail) => {
            const d = detail as actionTestSummary & {group?: string}
            if (d.group) {
              if (groups[d.group]) {
                groups[d.group].push(detail)
              } else {
                groups[d.group] = [detail]
              }
            }
            return groups
          },
          {}
        )

        for (const [, details] of Object.entries(detailGroup)) {
          const configurationGroup = details.reduce(
            (groups: {[key: string]: actionTestSummaries}, detail) => {
              if (detail.identifier) {
                if (groups[detail.identifier]) {
                  groups[detail.identifier].push(detail)
                } else {
                  groups[detail.identifier] = [detail]
                }
              }
              return groups
            },
            {}
          )

          for (const [, details] of Object.entries(configurationGroup)) {
            for (const [, detail] of details.entries()) {
              const testResult = detail as ActionTestMetadata

              if (testResult.summaryRef) {
                const summary: ActionTestSummary =
                  await this.parser.parseLegacy(testResult.summaryRef.id)

                const testFailureGroup = new TestFailureGroup(
                  testResultSummaryName || '',
                  summary.identifier || '',
                  summary.name || ''
                )
                testFailures.failureGroups.push(testFailureGroup)

                if (summary.failureSummaries) {
                  const testFailure = new TestFailure()
                  testFailureGroup.failures.push(testFailure)

                  const failureSummaries = collectFailureSummaries(
                    summary.failureSummaries
                  )
                  for (const failureSummary of failureSummaries) {
                    testFailure.lines.push(`${failureSummary.contents}`)

                    const workspace = path.dirname(
                      `${testReport.creatingWorkspaceFilePath}`
                    )
                    let filepath = ''
                    if (failureSummary.filePath) {
                      filepath = failureSummary.filePath.replace(
                        `${workspace}/`,
                        ''
                      )
                    }
                    if (
                      filepath &&
                      failureSummary.lineNumber &&
                      failureSummary.message
                    ) {
                      const annotation = new Annotation(
                        filepath,
                        failureSummary.lineNumber,
                        failureSummary.lineNumber,
                        'failure',
                        failureSummary.message,
                        failureSummary.issueType
                      )
                      annotations.push(annotation)
                    }
                  }
                }
              }
            }
          }
        }
      }
      for (const annotation of annotations) {
        testReport.annotations.push(annotation)
      }

      chapterSummary.content.push(`### ${failedIcon} Failures`)
      const summaryFailures: string[] = []

      for (const failureGroup of testFailures.failureGroups) {
        if (failureGroup.failures.length) {
          const testIdentifier = `${failureGroup.summaryIdentifier}_${failureGroup.identifier}`
          const anchorName = anchorIdentifier(testIdentifier)
          const anchorTag = anchorNameTag(`${testIdentifier}_failure-summary`)
          const testMethodLink = `${anchorTag}<a href="${anchorName}">${failureGroup.summaryIdentifier}/${failureGroup.identifier}</a>`
          summaryFailures.push(`<h4>${testMethodLink}</h4>`)
          for (const failure of failureGroup.failures) {
            for (const line of failure.lines) {
              summaryFailures.push(line)
            }
          }
        }
      }
      if (summaryFailures.length) {
        chapterSummary.content.push(summaryFailures.join('\n'))
        chapterSummary.content.push('')
      } else {
        chapterSummary.content.push('All tests passed :tada:\n')
      }

      if (testReport.codeCoverage && options.showCodeCoverage) {
        const workspace = path.dirname(
          `${testReport.creatingWorkspaceFilePath}`
        )
        chapterSummary.content.push('---\n')

        const re = new RegExp(`${workspace}/`, 'g')
        let root = ''
        if (process.env.GITHUB_REPOSITORY) {
          const pr = github.context.payload.pull_request
          const sha = (pr && pr.head.sha) || github.context.sha
          root = `${github.context.serverUrl}/${github.context.repo.owner}/${github.context.repo.repo}/blob/${sha}/`
        }
        chapterSummary.content.push(
          testReport.codeCoverage.lines.join('\n').replace(re, root)
        )
      }

      const testDetails = new TestDetails()
      for (const [, results] of Object.entries(chapter.sections)) {
        const testDetail = new TestDetail()
        testDetails.details.push(testDetail)

        const testResultSummaryName = results.summary.name
        const anchorTag = anchorNameTag(`${testResultSummaryName}`)
        const anchorName = anchorIdentifier(`${testResultSummaryName}_summary`)
        testDetail.lines.push(
          `#### ${anchorTag}${testResultSummaryName}[${backIcon}](${anchorName})`
        )
        testDetail.lines.push('')

        const detailGroup = results.details.reduce(
          (groups: {[key: string]: actionTestSummaries}, detail) => {
            const d = detail as actionTestSummary & {group?: string}
            if (d.group) {
              if (groups[d.group]) {
                groups[d.group].push(detail)
              } else {
                groups[d.group] = [detail]
              }
            }
            return groups
          },
          {}
        )

        for (const [identifier, details] of Object.entries(detailGroup)) {
          const groupIdentifier = identifier

          const [passed, failed, skipped, expectedFailure, total, duration] =
            details.reduce(
              (
                [passed, failed, skipped, expectedFailure, total, duration]: [
                  number,
                  number,
                  number,
                  number,
                  number,
                  number
                ],
                detail
              ) => {
                const test = detail as ActionTestSummary
                switch (test.testStatus) {
                  case 'Success':
                    passed++
                    break
                  case 'Failure':
                    failed++
                    break
                  case 'Skipped':
                    skipped++
                    break
                  case 'Expected Failure':
                    expectedFailure++
                    break
                }

                total++

                if (test.duration) {
                  duration = test.duration
                }
                return [
                  passed,
                  failed,
                  skipped,
                  expectedFailure,
                  total,
                  duration
                ]
              },
              [0, 0, 0, 0, 0, 0]
            )

          const testName = `${groupIdentifier}`
          const passedRate = ((passed / total) * 100).toFixed(0)
          const failedRate = ((failed / total) * 100).toFixed(0)
          const skippedRate = ((skipped / total) * 100).toFixed(0)
          const expectedFailureRate = ((expectedFailure / total) * 100).toFixed(
            0
          )
          const testDuration = duration.toFixed(2)

          const anchorTag = anchorNameTag(
            `${testResultSummaryName}_${groupIdentifier}`
          )
          const anchorName = anchorIdentifier(
            `${testResultSummaryName}_${groupIdentifier}_summary`
          )
          const anchorBack = `[${backIcon}](${anchorName})`
          testDetail.lines.push(
            `${anchorTag}<h5>${testName}&nbsp;${anchorBack}</h5>`
          )

          const testsStatsLines: string[] = []

          testsStatsLines.push('<table>')
          testsStatsLines.push('<tr>')
          const header = [
            `<th>${passedIcon}`,
            `<th>${failedIcon}`,
            `<th>${skippedIcon}`,
            `<th>${expectedFailureIcon}`,
            `<th>:stopwatch:`
          ].join('')
          testsStatsLines.push(header)

          testsStatsLines.push('<tr>')
          let failedCount: string
          if (failed > 0) {
            failedCount = `<b>${failed} (${failedRate}%)</b>`
          } else {
            failedCount = `${failed} (${failedRate}%)`
          }
          const cols = [
            `<td align="right" width="154px">${passed} (${passedRate}%)`,
            `<td align="right" width="154px">${failedCount}`,
            `<td align="right" width="154px">${skipped} (${skippedRate}%)`,
            `<td align="right" width="154px">${expectedFailure} (${expectedFailureRate}%)`,
            `<td align="right" width="154px">${testDuration}s`
          ].join('')
          testsStatsLines.push(cols)
          testsStatsLines.push('</table>\n')

          testDetail.lines.push(testsStatsLines.join('\n'))

          const testDetailTable: string[] = []
          testDetailTable.push(`<table>`)

          const configurationGroup = details.reduce(
            (groups: {[key: string]: actionTestSummaries}, detail) => {
              if (detail.identifier) {
                if (groups[detail.identifier]) {
                  groups[detail.identifier].push(detail)
                } else {
                  groups[detail.identifier] = [detail]
                }
              }
              return groups
            },
            {}
          )

          for (const [, details] of Object.entries(configurationGroup)) {
            const statuses = details.map(detail => {
              const test = detail as ActionTestSummary
              return test.testStatus
            })
            let groupStatus = ''
            if (statuses.length) {
              if (statuses.every(status => status === 'Success')) {
                groupStatus = 'Success'
              } else if (statuses.every(status => status === 'Failure')) {
                groupStatus = 'Failure'
              } else if (statuses.every(status => status === 'Skipped')) {
                groupStatus = 'Skipped'
              } else if (
                statuses.every(status => status === 'Expected Failure')
              ) {
                groupStatus = 'Expected Failure'
              } else {
                if (
                  statuses
                    .filter(status => status !== 'Skipped')
                    .some(status => status === 'Failure')
                ) {
                  groupStatus = 'Mixed Failure'
                } else if (
                  statuses
                    .filter(status => status !== 'Skipped')
                    .filter(status => status !== 'Expected Failure')
                    .every(status => status === 'Success')
                ) {
                  groupStatus = 'Mixed Success'
                } else {
                  groupStatus = 'Expected Failure'
                }
              }
            }
            const groupStatusImage = Image.testStatus(groupStatus)

            let skippedPassedTests = 0
            for (const [index, detail] of details.entries()) {
              const testResult = detail as ActionTestMetadata
              if (!testResult.testStatus) {
                continue
              }

              const isFailure = testResult.testStatus === 'Failure'

              const rowSpan = `rowspan="${details.length}"`
              const valign = `valign="top"`
              const colWidth = 'width="52px"'
              const detailWidth = 'width="716px"'

              const status = Image.testStatus(testResult.testStatus)
              const resultLines: string[] = []

              if (testResult.summaryRef) {
                const summary: ActionTestSummary =
                  await this.parser.parseLegacy(testResult.summaryRef.id)

                if (summary.configuration) {
                  if (testResult.name) {
                    const anchorTag = anchorNameTag(
                      `${testResultSummaryName}_${testResult.identifier}`
                    )
                    const testMethodAnchor = isFailure ? anchorTag : ''
                    const backAnchorName = anchorIdentifier(
                      `${testResultSummaryName}_${testResult.identifier}_failure-summary`
                    )
                    const backAnchorLink = isFailure
                      ? `<a href="${backAnchorName}">${backIcon}</a>`
                      : ''
                    const testMethod = `${testMethodAnchor}${testMethodIcon}&nbsp;<code>${testResult.name}</code>${backAnchorLink}`
                    resultLines.push(`${status} ${testMethod}`)
                  }
                  if (!options.showPassedTests && !isFailure) {
                    skippedPassedTests++
                    continue
                  }

                  const configuration = summary.configuration
                  const configurationValues = configuration.values.storage
                    .map(value => {
                      return `${value.key}: ${value.value}`
                    })
                    .join(', ')

                  resultLines.push(
                    `<br><b>Configuration:</b><br><code>${configurationValues}</code>`
                  )
                } else {
                  if (!options.showPassedTests && !isFailure) {
                    continue
                  }
                  if (testResult.name) {
                    const anchorTag = anchorNameTag(
                      `${testResultSummaryName}_${testResult.identifier}`
                    )
                    const testMethodAnchor = isFailure ? anchorTag : ''
                    const backAnchorName = anchorIdentifier(
                      `${testResultSummaryName}_${testResult.identifier}_failure-summary`
                    )
                    const backAnchorLink = isFailure
                      ? `<a href="${backAnchorName}">${backIcon}</a>`
                      : ''
                    const testMethod = `${testMethodAnchor}${testMethodIcon}&nbsp;<code>${testResult.name}</code>${backAnchorLink}`
                    resultLines.push(`${testMethod}`)
                  }
                }

                const activities: Activity[] = []
                if (summary.activitySummaries) {
                  await this.collectActivities(
                    summary.activitySummaries,
                    activities
                  )
                }
                if (activities.length) {
                  if (
                    !options.showPassedTests &&
                    summary.testStatus !== 'Failure'
                  ) {
                    continue
                  }

                  const testActivities = activities
                    .map(activity => {
                      const attachments = activity.attachments
                        .filter(attachment => {
                          return attachment.dimensions
                        })
                        .map(attachment => {
                          let width = '100%'
                          const dimensions = attachment.dimensions
                          if (dimensions.width && dimensions.height) {
                            const orientation = dimensions.orientation
                            if (orientation && orientation >= 5) {
                              width = `${dimensions.height}px`
                            } else {
                              width = `${dimensions.width}px`
                            }
                          }

                          const userInfo = attachment.userInfo
                          if (userInfo) {
                            for (const info of userInfo.storage) {
                              if (info.key === 'Scale') {
                                const scale = parseInt(`${info.value}`)
                                if (dimensions.width && dimensions.height) {
                                  if (
                                    dimensions.orientation &&
                                    dimensions.orientation >= 5
                                  ) {
                                    const value = dimensions.height / scale
                                    width = `${value.toFixed(0)}px`
                                  } else {
                                    const value = dimensions.width / scale
                                    width = `${value.toFixed(0)}px`
                                  }
                                } else {
                                  width = `${(100 / scale).toFixed(0)}%`
                                }
                              }
                            }
                          }

                          const widthAttr = `width="${width}"`
                          return `<div><img ${widthAttr} src="${attachment.link}"></div>`
                        })

                      if (attachments.length) {
                        const testStatus = testResult.testStatus
                        const open = testStatus.includes('Failure')
                          ? 'open'
                          : ''
                        const title = escapeHashSign(activity.title)
                        const message = `${indentation(
                          activity.indent
                        )}- ${title}`
                        const attachmentIndent = indentation(
                          activity.indent + 1
                        )
                        const attachmentContent = attachments.join('')
                        return `${message}\n${attachmentIndent}<details ${open}><summary>${attachmentIcon}</summary>${attachmentContent}</details>\n`
                      } else {
                        const indent = indentation(activity.indent)
                        return `${indent}- ${escapeHashSign(activity.title)}`
                      }
                    })
                    .join('\n')

                  resultLines.push(
                    `<br><b>Activities:</b>\n\n${testActivities}`
                  )
                }
              } else {
                if (!options.showPassedTests && !isFailure) {
                  continue
                }
                if (testResult.name) {
                  const anchorTag = anchorNameTag(
                    `${testResultSummaryName}_${testResult.identifier}`
                  )
                  const testMethodAnchor = isFailure ? anchorTag : ''
                  const backAnchorName = anchorIdentifier(
                    `${testResultSummaryName}_${testResult.identifier}_failure-summary`
                  )
                  const backAnchorLink = isFailure
                    ? `<a href="${backAnchorName}">${backIcon}</a>`
                    : ''
                  const testMethod = `${testMethodAnchor}${testMethodIcon}&nbsp;<code>${testResult.name}</code>${backAnchorLink}`
                  resultLines.push(`${testMethod}`)
                }
              }

              const testResultContent = resultLines.join('<br>')
              let testResultRow = ''
              if (details.length > 1) {
                if (index - skippedPassedTests === 0) {
                  testResultRow = `<tr><td align="center" ${rowSpan} ${valign} ${colWidth}>${groupStatusImage}<td ${valign} ${detailWidth}>${testResultContent}`
                } else {
                  testResultRow = `<tr><td ${valign} ${detailWidth}>${testResultContent}`
                }
              } else {
                testResultRow = `<tr><td align="center" ${valign} ${colWidth}>${status}<td ${valign} ${detailWidth}>${testResultContent}`
              }
              testDetailTable.push(testResultRow)
            }
          }

          testDetailTable.push(`</table>`)
          testDetailTable.push('')

          if (testDetailTable.join('').trim() === '<table></table>') {
            testDetail.lines.push('All tests passed :tada:\n')
          } else {
            testDetail.lines.push(testDetailTable.join('\n'))
          }
        }
      }

      const chapterDetail = new TestReportChapterDetail()
      chapter.details.push(chapterDetail)

      chapterDetail.content.push(testDetails.header)
      for (const testDetail of testDetails.details) {
        for (const detail of testDetail.lines) {
          chapterDetail.content.push(detail)
        }
      }
    }

    return testReport
  }

  async collectTestSummaries(
    group: ActionTestableSummary | ActionTestSummaryGroup,
    tests: actionTestSummaries,
    testSummaries: actionTestSummaries
  ): Promise<void> {
    if (!tests) {
      return
    }

    for (const test of tests) {
      if (test.hasOwnProperty('subtests')) {
        const group = test as ActionTestSummaryGroup
        await this.collectTestSummaries(group, group.subtests, testSummaries)
      } else {
        const t = test as actionTestSummary & {group?: string}
        t.group = group.name
        testSummaries.push(test)
      }
    }
  }

  async collectActivities(
    activitySummaries: ActionTestActivitySummary[],
    activities: Activity[],
    indent = 0
  ): Promise<void> {
    for (const activitySummary of activitySummaries) {
      const activity = activitySummary as Activity
      activity.indent = indent
      await exportAttachments(this.parser, activity)
      activities.push(activity)

      if (activitySummary.subactivities) {
        await this.collectActivities(
          activitySummary.subactivities,
          activities,
          indent + 1
        )
      }
    }
  }

  async formatModern(options: FormatterOptions): Promise<TestReport> {
    const testReport = new TestReport()
    const sourcePaths = new SourcePathResolver(process.env.GITHUB_WORKSPACE)

    let buildResults: BuildResults | undefined
    try {
      buildResults = await this.parser.parseBuildResults()
    } catch (error) {
      core.warning(`Failed to read build results: ${(error as Error).message}`)
    }

    if (buildResults && buildResults.errors.length) {
      const buildLog = new BuildResultsLog()
      for (const issue of buildResults.errors) {
        const location = parseSourceURL(issue.sourceURL)
        const issueTitle = `${issue.issueType}:&nbsp;${escapeHTML(issue.message)}`
        if (location) {
          const displayPath = sourcePaths.displayPath(location.filePath)
          buildLog.content.push(
            `- error:&nbsp;${issueTitle}<br><code>${displayPath}:${location.lineNumber}:${location.columnNumber}</code>`
          )
          const annotationPath = await sourcePaths.annotationPath(
            location.filePath
          )
          if (annotationPath) {
            buildLog.annotations.push(
              new Annotation(
                annotationPath,
                location.lineNumber,
                location.lineNumber,
                'failure',
                issue.message,
                issue.issueType
              )
            )
          }
        } else {
          buildLog.content.push(`- error:&nbsp;${issueTitle}`)
        }
      }
      testReport.buildLog = buildLog
      testReport.testStatus = 'failure'
      testReport.annotations.push(...buildLog.annotations)
    }

    const modernResult = await this.parser.parseModernTests()
    const testCases = collectModernTestCases(modernResult.testNodes)

    if (!testCases.length && testReport.buildLog) {
      // The build failed before any test was run
      return testReport
    }

    const testStats = countModernTestResults(testCases)
    const failedTests = testCases.filter(testCase => {
      return testCase.result === 'Failed'
    })

    const testPlanName = modernResult.testNodes[0]?.name || 'Test Results'
    const testReportChapter = new TestReportChapter(
      'Test',
      {} as ActionRunDestinationRecord,
      buildResults?.actionTitle || testPlanName
    )
    testReport.chapters.push(testReportChapter)

    const chapterSummary = new TestReportChapterSummary()
    testReportChapter.summaries.push(chapterSummary)

    chapterSummary.content.push('### Summary')
    chapterSummary.content.push('<table>')
    chapterSummary.content.push('<tr>')
    const header = [
      `<th>Total`,
      `<th>${passedIcon}&nbsp;Passed`,
      `<th>${failedIcon}&nbsp;Failed`,
      `<th>${skippedIcon}&nbsp;Skipped`,
      `<th>${expectedFailureIcon}&nbsp;Expected Failure`,
      `<th>:stopwatch:&nbsp;Time`
    ].join('')
    chapterSummary.content.push(header)

    chapterSummary.content.push('<tr>')
    let failedCount: string
    if (testStats.failed > 0) {
      failedCount = `<b>${testStats.failed}</b>`
    } else {
      failedCount = `${testStats.failed}`
    }
    const duration = testStats.duration.toFixed(2)
    const cols = [
      `<td align="right" width="118px">${testStats.total}`,
      `<td align="right" width="118px">${testStats.passed}`,
      `<td align="right" width="118px">${failedCount}`,
      `<td align="right" width="118px">${testStats.skipped}`,
      `<td align="right" width="158px">${testStats.expectedFailure}`,
      `<td align="right" width="138px">${duration}s`
    ].join('')
    chapterSummary.content.push(cols)
    chapterSummary.content.push('</table>\n')

    chapterSummary.content.push('---\n')

    if (testStats.failed > 0) {
      testReport.testStatus = 'failure'
    } else if (testStats.passed > 0 && !testReport.buildLog) {
      testReport.testStatus = 'success'
    }

    chapterSummary.content.push('### Test Summary')

    const testGroups: {
      [bundleName: string]: {[suiteName: string]: ModernTestCase[]}
    } = {}
    for (const testCase of testCases) {
      const suites = (testGroups[testCase.bundleName] ??= {})
      ;(suites[testCase.suiteName] ??= []).push(testCase)
    }

    const deviceLines = modernResult.devices.map(device => {
      return `- **Device:** ${deviceDescription(device)}`
    })
    if (modernResult.testPlanConfigurations.length > 1) {
      const configurations = modernResult.testPlanConfigurations
        .map(configuration => configuration.configurationName)
        .join(', ')
      deviceLines.push(`- **Configurations:** ${configurations}`)
    }

    for (const [bundleName, suites] of Object.entries(testGroups)) {
      const anchorName = anchorIdentifier(bundleName)
      const anchorTag = anchorNameTag(`${bundleName}_summary`)
      chapterSummary.content.push(
        `#### ${anchorTag}[${bundleName}](${anchorName})\n`
      )
      chapterSummary.content.push(...deviceLines)

      chapterSummary.content.push('<table>')
      chapterSummary.content.push('<tr>')
      const tableHeader = [
        `<th>Test`,
        `<th>Total`,
        `<th>${passedIcon}`,
        `<th>${failedIcon}`,
        `<th>${skippedIcon}`,
        `<th>${expectedFailureIcon}`
      ].join('')
      chapterSummary.content.push(tableHeader)

      for (const [suiteName, cases] of Object.entries(suites)) {
        const suiteStats = countModernTestResults(cases)

        chapterSummary.content.push('<tr>')
        const testClass = `${testClassIcon}&nbsp;${escapeHTML(suiteName)}`
        const testClassAnchor = anchorNameTag(
          `${bundleName}_${suiteName}_summary`
        )
        const suiteAnchorName = anchorIdentifier(`${bundleName}_${suiteName}`)
        const testClassLink = `<a href="${suiteAnchorName}">${testClass}</a>`

        let suiteFailedCount: string
        if (suiteStats.failed > 0) {
          suiteFailedCount = `<b>${suiteStats.failed}</b>`
        } else {
          suiteFailedCount = `${suiteStats.failed}`
        }
        const suiteCols = [
          `<td align="left" width="368px">${testClassAnchor}${testClassLink}`,
          `<td align="right" width="80px">${suiteStats.total}`,
          `<td align="right" width="80px">${suiteStats.passed}`,
          `<td align="right" width="80px">${suiteFailedCount}`,
          `<td align="right" width="80px">${suiteStats.skipped}`,
          `<td align="right" width="80px">${suiteStats.expectedFailure}`
        ].join('')
        chapterSummary.content.push(suiteCols)
      }
      chapterSummary.content.push('')
      chapterSummary.content.push('</table>\n')
    }

    chapterSummary.content.push('---\n')

    chapterSummary.content.push(`### ${failedIcon} Failures`)

    if (failedTests.length > 0) {
      const summaryFailures: string[] = []
      for (const failure of failedTests) {
        const testIdentifier = `${failure.bundleName}_${failure.identifier}`
        const anchorName = anchorIdentifier(testIdentifier)
        const anchorTag = anchorNameTag(`${testIdentifier}_failure-summary`)
        const testName = escapeHTML(
          `${failure.bundleName}/${failure.identifier}`
        )
        const testMethodLink = `${anchorTag}<a href="${anchorName}">${testName}</a>`
        summaryFailures.push(`<h4>${testMethodLink}</h4>`)

        const issues = failure.issues.filter(issue => issue.kind === 'failure')
        // Repetitions and arguments often fail with the same issue
        const annotated = new Set<string>()
        for (const issue of issues) {
          summaryFailures.push(`${issueTable(issue, sourcePaths)}\n`)

          if (issue.filePath && issue.lineNumber) {
            const annotationPath = await sourcePaths.annotationPath(
              issue.filePath
            )
            const key = `${annotationPath}:${issue.lineNumber}:${issue.message}`
            if (annotationPath && !annotated.has(key)) {
              annotated.add(key)
              testReport.annotations.push(
                new Annotation(
                  annotationPath,
                  issue.lineNumber,
                  issue.lineNumber,
                  'failure',
                  issue.message,
                  `${failure.bundleName}/${failure.identifier}`
                )
              )
            }
          }
        }
      }
      chapterSummary.content.push(summaryFailures.join('\n'))
      chapterSummary.content.push('')
    } else {
      chapterSummary.content.push('All tests passed :tada:\n')
    }

    if (options.showCodeCoverage) {
      const codeCoverage = await this.modernCodeCoverage(
        process.env.GITHUB_WORKSPACE
      )
      if (codeCoverage) {
        testReport.codeCoverage = codeCoverage.coverage
        chapterSummary.content.push('---\n')
        chapterSummary.content.push(codeCoverage.content)
      }
    }

    const chapterDetail = new TestReportChapterDetail()
    testReportChapter.details.push(chapterDetail)

    chapterDetail.content.push('### Test Details\n')

    for (const [bundleName, suites] of Object.entries(testGroups)) {
      const bundleAnchorTag = anchorNameTag(bundleName)
      const bundleAnchorName = anchorIdentifier(`${bundleName}_summary`)
      chapterDetail.content.push(
        `#### ${bundleAnchorTag}${bundleName}[${backIcon}](${bundleAnchorName})`
      )
      chapterDetail.content.push('')

      for (const [suiteName, cases] of Object.entries(suites)) {
        const suiteStats = countModernTestResults(cases)
        const rate = (count: number): string => {
          return ((count / suiteStats.total) * 100).toFixed(0)
        }

        const suiteAnchorTag = anchorNameTag(`${bundleName}_${suiteName}`)
        const suiteAnchorName = anchorIdentifier(
          `${bundleName}_${suiteName}_summary`
        )
        const anchorBack = `[${backIcon}](${suiteAnchorName})`
        chapterDetail.content.push(
          `${suiteAnchorTag}<h5>${escapeHTML(suiteName)}&nbsp;${anchorBack}</h5>`
        )

        const testsStatsLines: string[] = []
        testsStatsLines.push('<table>')
        testsStatsLines.push('<tr>')
        const statsHeader = [
          `<th>${passedIcon}`,
          `<th>${failedIcon}`,
          `<th>${skippedIcon}`,
          `<th>${expectedFailureIcon}`,
          `<th>:stopwatch:`
        ].join('')
        testsStatsLines.push(statsHeader)

        testsStatsLines.push('<tr>')
        let detailFailedCount: string
        if (suiteStats.failed > 0) {
          detailFailedCount = `<b>${suiteStats.failed} (${rate(suiteStats.failed)}%)</b>`
        } else {
          detailFailedCount = `${suiteStats.failed} (${rate(suiteStats.failed)}%)`
        }
        const statsCols = [
          `<td align="right" width="154px">${suiteStats.passed} (${rate(suiteStats.passed)}%)`,
          `<td align="right" width="154px">${detailFailedCount}`,
          `<td align="right" width="154px">${suiteStats.skipped} (${rate(suiteStats.skipped)}%)`,
          `<td align="right" width="154px">${suiteStats.expectedFailure} (${rate(suiteStats.expectedFailure)}%)`,
          `<td align="right" width="154px">${suiteStats.duration.toFixed(2)}s`
        ].join('')
        testsStatsLines.push(statsCols)
        testsStatsLines.push('</table>\n')

        chapterDetail.content.push(testsStatsLines.join('\n'))

        const testResultRows: string[] = []
        for (const testCase of cases) {
          const isFailure = testCase.result === 'Failed'
          if (!options.showPassedTests && !isFailure) {
            continue
          }

          const status = modernTestStatusIcon(testCase.result)
          const valign = `valign="top"`
          const colWidth = 'width="52px"'
          const detailWidth = 'width="716px"'

          const testIdentifier = `${bundleName}_${testCase.identifier}`
          const testMethodAnchorTag = isFailure
            ? anchorNameTag(testIdentifier)
            : ''
          const backAnchorName = anchorIdentifier(
            `${testIdentifier}_failure-summary`
          )
          const backAnchorLink = isFailure
            ? `<a href="${backAnchorName}">${backIcon}</a>`
            : ''
          const testMethod = `${testMethodAnchorTag}${testMethodIcon}&nbsp;<code>${escapeHTML(testCase.name)}</code>${backAnchorLink}`

          const resultLines = [testMethod]
          if (testCase.details) {
            resultLines.push(`<br><i>${escapeHTML(testCase.details)}</i>`)
          }
          if (testCase.issues.length) {
            resultLines.push('<br>')
            for (const issue of testCase.issues) {
              resultLines.push(issueTable(issue, sourcePaths))
            }
          }

          testResultRows.push(
            `<tr><td align="center" ${valign} ${colWidth}>${status}<td ${valign} ${detailWidth}>${resultLines.join('')}`
          )
        }

        if (testResultRows.length) {
          chapterDetail.content.push(
            ['<table>', ...testResultRows, '</table>', ''].join('\n')
          )
        } else {
          chapterDetail.content.push('All tests passed :tada:\n')
        }
      }
    }

    return testReport
  }

  private async modernCodeCoverage(
    workspace?: string
  ): Promise<{coverage: TestCodeCoverage; content: string} | undefined> {
    let codeCoverage: CodeCoverage
    try {
      codeCoverage = Convert.toCodeCoverage(
        await this.parser.exportCodeCoverage()
      )
    } catch {
      // The result bundle does not contain code coverage data
      return undefined
    }

    const coverage = new TestCodeCoverage(codeCoverage)
    let content = coverage.lines.join('\n')
    if (workspace) {
      let root = ''
      if (process.env.GITHUB_REPOSITORY) {
        const pr = github.context.payload.pull_request
        const sha = (pr && pr.head.sha) || github.context.sha
        root = `${github.context.serverUrl}/${github.context.repo.owner}/${github.context.repo.repo}/blob/${sha}/`
      }
      content = content.split(`${workspace}/`).join(root)
    }
    return {coverage, content}
  }
}

function collectFailureSummaries(
  failureSummaries: ActionTestFailureSummary[]
): FailureSummary[] {
  return failureSummaries.map(failureSummary => {
    const fileName = failureSummary.fileName
    const sourceCodeContext = failureSummary.sourceCodeContext
    const callStack = sourceCodeContext?.callStack
    const location = sourceCodeContext?.location
    const filePath = location?.filePath || fileName
    const lineNumber = location?.lineNumber

    let fileLocation = ''
    if (fileName && lineNumber) {
      fileLocation = `${fileName}:${lineNumber}`
    } else if (fileName) {
      fileLocation = fileName
    }

    const titleAlign = 'align="right"'
    const titleWidth = 'width="100px"'
    const titleAttr = `${titleAlign} ${titleWidth}`
    const detailWidth = 'width="668px"'
    const contents =
      '<table>' +
      `<tr><td ${titleAttr}><b>File</b><td ${detailWidth}>${fileLocation}` +
      `<tr><td ${titleAttr}><b>Issue Type</b><td ${detailWidth}>${failureSummary.issueType}` +
      `<tr><td ${titleAttr}><b>Message</b><td ${detailWidth}>${failureSummary.message}` +
      `</table>\n`

    const stackTrace = callStack
      ?.map((callStack, index) => {
        const addressString = callStack.addressString
        const symbolInfo = callStack.symbolInfo
        const imageName = symbolInfo?.imageName || ''
        const symbolName = symbolInfo?.symbolName || ''
        const location = symbolInfo?.location
        const filePath = location?.filePath || fileName
        const lineNumber = location?.lineNumber
        const seq = `${index}`.padEnd(2, ' ')
        return `${seq} ${imageName} ${addressString} ${symbolName} ${filePath}: ${lineNumber}`
      })
      .join('\n')
    return {
      filePath,
      lineNumber,
      issueType: failureSummary.issueType,
      message: failureSummary.message,
      contents,
      stackTrace: stackTrace || []
    } as FailureSummary
  })
}

interface FailureSummary {
  filePath: string
  lineNumber: number
  issueType: string
  message: string
  contents: string
  stackTrace: string
}

export class FormatterOptions {
  showPassedTests: boolean
  showCodeCoverage: boolean

  constructor(showPassedTests = true, showCodeCoverage = true) {
    this.showPassedTests = showPassedTests
    this.showCodeCoverage = showCodeCoverage
  }
}

interface ModernTestIssue {
  kind: 'failure' | 'skip' | 'expectedFailure'
  message: string
  fileName?: string
  filePath?: string
  lineNumber?: number
  // e.g. the repetition ("Retry 1"), arguments or device the issue belongs to
  context?: string
}

interface ModernTestCase {
  name: string
  identifier: string
  result: TestResult
  details?: string
  duration: number
  bundleName: string
  suiteName: string
  issues: ModernTestIssue[]
}

function collectModernTestCases(testNodes: TestNode[]): ModernTestCase[] {
  const testCases: ModernTestCase[] = []

  const visit = (
    nodes: TestNode[],
    bundleName: string,
    suitePath: string[]
  ): void => {
    for (const node of nodes) {
      switch (node.nodeType) {
        case 'Unit test bundle':
        case 'UI test bundle':
          visit(node.children ?? [], node.name, [])
          break
        case 'Test Suite':
          visit(node.children ?? [], bundleName, [...suitePath, node.name])
          break
        case 'Test Case': {
          // Test cases are counted once, the same way `xcresulttool get
          // test-results summary` does. Individual runs (repetitions,
          // arguments, devices, configurations) only contribute their issues.
          const result = node.result ?? 'unknown'
          testCases.push({
            name: node.name,
            identifier:
              node.nodeIdentifier ?? [...suitePath, node.name].join('/'),
            result,
            details: node.details,
            duration: node.durationInSeconds ?? 0,
            bundleName,
            suiteName: suitePath.join('/') || bundleName,
            issues: collectModernTestIssues(node, result, [])
          })
          break
        }
        default:
          visit(node.children ?? [], bundleName, suitePath)
          break
      }
    }
  }

  visit(testNodes, '', [])
  return testCases
}

function collectModernTestIssues(
  node: TestNode,
  result: TestResult,
  context: string[]
): ModernTestIssue[] {
  const issues: ModernTestIssue[] = []

  for (const child of node.children ?? []) {
    switch (child.nodeType) {
      case 'Failure Message':
      case 'Skip Message':
      case 'Expected Failure': {
        // Before schema version 0.2.0 (Xcode 16 - 26), skip and expected
        // failure reasons were reported as 'Failure Message' nodes as well.
        const message = parseModernTestMessage(child)
        let kind: ModernTestIssue['kind'] = 'failure'
        if (
          child.nodeType === 'Skip Message' ||
          result === 'Skipped' ||
          /^Test skipped\b/.test(message.message)
        ) {
          kind = 'skip'
        } else if (
          child.nodeType === 'Expected Failure' ||
          result === 'Expected Failure'
        ) {
          kind = 'expectedFailure'
        }
        issues.push({
          kind,
          ...message,
          context: context.join(' › ') || undefined
        })
        break
      }
      case 'Arguments':
      case 'Repetition':
      case 'Device':
      case 'Test Plan Configuration':
      case 'Test Case Run': {
        const name =
          child.nodeType === 'Arguments'
            ? `Arguments: ${child.name}`
            : child.name
        issues.push(
          ...collectModernTestIssues(child, child.result ?? result, [
            ...context,
            name
          ])
        )
        break
      }
      default:
        break
    }
  }

  return issues
}

function parseModernTestMessage(
  node: TestNode
): Pick<ModernTestIssue, 'message' | 'fileName' | 'filePath' | 'lineNumber'> {
  // Before schema version 0.3.0 (Xcode 16 - 26), the source location was
  // only available as a message prefix, e.g. "File.swift:12: XCTAssertTrue failed"
  const match = node.name.match(/^([^\s:/][^:\n]*\.[A-Za-z0-9+]+):(\d+): /)
  if (node.sourceLocation) {
    return {
      message: match ? node.name.substring(match[0].length) : node.name,
      fileName: path.basename(node.sourceLocation.filePath),
      filePath: node.sourceLocation.filePath,
      lineNumber: node.sourceLocation.lineNumber
    }
  } else if (match) {
    return {
      message: node.name.substring(match[0].length),
      fileName: match[1],
      filePath: match[1],
      lineNumber: parseInt(match[2], 10)
    }
  }
  return {message: node.name}
}

function countModernTestResults(testCases: ModernTestCase[]): {
  total: number
  passed: number
  failed: number
  skipped: number
  expectedFailure: number
  duration: number
} {
  const stats = {
    total: testCases.length,
    passed: 0,
    failed: 0,
    skipped: 0,
    expectedFailure: 0,
    duration: 0
  }
  for (const testCase of testCases) {
    stats.duration += testCase.duration
    switch (testCase.result) {
      case 'Passed':
        stats.passed++
        break
      case 'Failed':
        stats.failed++
        break
      case 'Skipped':
        stats.skipped++
        break
      case 'Expected Failure':
        stats.expectedFailure++
        break
    }
  }
  return stats
}

function modernTestStatusIcon(result: TestResult): string {
  switch (result) {
    case 'Passed':
      return passedIcon
    case 'Failed':
      return failedIcon
    case 'Skipped':
      return skippedIcon
    case 'Expected Failure':
      return expectedFailureIcon
    default:
      return Image.testStatus('unknown')
  }
}

function issueTable(
  issue: ModernTestIssue,
  sourcePaths: SourcePathResolver
): string {
  const titleAttr = 'align="right" width="100px"'
  const detailWidth = 'width="668px"'

  const rows: string[] = []
  if (issue.filePath) {
    const location = issue.lineNumber
      ? `${sourcePaths.displayPath(issue.filePath)}:${issue.lineNumber}`
      : sourcePaths.displayPath(issue.filePath)
    rows.push(`<tr><td ${titleAttr}><b>File</b><td ${detailWidth}>${location}`)
  }
  if (issue.context) {
    rows.push(
      `<tr><td ${titleAttr}><b>Run</b><td ${detailWidth}>${escapeHTML(issue.context)}`
    )
  }
  const title =
    issue.kind === 'skip'
      ? 'Skipped'
      : issue.kind === 'expectedFailure'
        ? 'Expected Failure'
        : 'Message'
  const message = escapeHTML(issue.message).replace(/\n/g, '<br>')
  rows.push(`<tr><td ${titleAttr}><b>${title}</b><td ${detailWidth}>${message}`)
  return `<table>${rows.join('')}</table>`
}

function deviceDescription(device: Device): string {
  const platform = device.platform ? `${device.platform} ` : ''
  const build = device.osBuildNumber ? ` (${device.osBuildNumber})` : ''
  return `${device.modelName}, ${platform}${device.osVersion}${build}`
}

function parseSourceURL(
  sourceURL?: string
): {filePath: string; lineNumber: number; columnNumber: number} | undefined {
  if (!sourceURL) {
    return undefined
  }
  try {
    const url = new URL(sourceURL)
    const fragment = new URLSearchParams(url.hash.substring(1))
    // Line and column numbers are 0-based
    const line = parseInt(fragment.get('StartingLineNumber') ?? '', 10)
    const column = parseInt(fragment.get('StartingColumnNumber') ?? '', 10)
    return {
      filePath: decodeURIComponent(url.pathname),
      lineNumber: isNaN(line) ? 1 : line + 1,
      columnNumber: isNaN(column) ? 1 : column + 1
    }
  } catch {
    return undefined
  }
}

function escapeHTML(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Maps source file paths reported by xcresulttool to paths relative to the
 * repository (`GITHUB_WORKSPACE`), as required by GitHub check annotations.
 */
class SourcePathResolver {
  private readonly fileNameCache = new Map<string, string | undefined>()

  constructor(private readonly workspace?: string) {}

  // Path shown in the report. Absolute paths outside the workspace are
  // shortened to the file name, so the report does not depend on whether
  // the source location includes the full path (Xcode 27+) or not.
  displayPath(filePath: string): string {
    return this.relativePath(filePath) ?? path.basename(filePath)
  }

  async annotationPath(filePath: string): Promise<string | undefined> {
    if (path.isAbsolute(filePath)) {
      return this.relativePath(filePath) ?? filePath
    }
    if (!this.workspace) {
      return undefined
    }

    // Only the file name is known (Xcode 16 - 26), look for a unique match
    const fileName = path.basename(filePath)
    if (!this.fileNameCache.has(fileName)) {
      let matches: string[] = []
      try {
        matches = await glob(`**/${escapeGlob(fileName)}`, {
          cwd: this.workspace,
          nodir: true,
          ignore: ['**/node_modules/**', '**/.build/**', '**/Pods/**']
        })
      } catch {
        // no-op
      }
      this.fileNameCache.set(
        fileName,
        matches.length === 1 ? matches[0] : undefined
      )
    }
    return this.fileNameCache.get(fileName)
  }

  private relativePath(filePath: string): string | undefined {
    if (this.workspace && filePath.startsWith(`${this.workspace}/`)) {
      return filePath.substring(this.workspace.length + 1)
    }
    return undefined
  }
}

function escapeGlob(text: string): string {
  return text.replace(/[*?[\]{}()!@+\\]/g, '\\$&')
}
