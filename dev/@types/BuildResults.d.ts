// Modern build result format (Xcode 16+)
// `xcrun xcresulttool get build-results --schema`

import {Device} from './TestResults_Tests'

export interface BuildResults {
  actionTitle?: string
  destination: Device
  startTime: number
  endTime: number
  status?: string
  analyzerWarningCount?: number
  errorCount?: number
  warningCount?: number
  analyzerWarnings: Issue[]
  warnings: Issue[]
  errors: Issue[]
}

export interface Issue {
  issueType: string
  message: string
  targetName?: string
  // e.g. file:///path/File.swift#StartingLineNumber=6&StartingColumnNumber=27&...
  // (line and column numbers are 0-based)
  sourceURL?: string
  className?: string
}
