// Modern test result format (Xcode 16+)
// `xcrun xcresulttool get test-results tests --schema`

export interface TestResults_Tests {
  devices: Device[]
  testNodes: TestNode[]
  testPlanConfigurations: Configuration[]
}

export interface Device {
  deviceId: string
  deviceName: string
  architecture: string
  modelName: string
  platform?: string
  osVersion: string
  osBuildNumber?: string
}

export interface Configuration {
  configurationId: string
  configurationName: string
}

export type TestNodeType =
  | 'Test Plan'
  | 'Unit test bundle'
  | 'UI test bundle'
  | 'Test Suite'
  | 'Test Case'
  | 'Device'
  | 'Test Plan Configuration'
  | 'Arguments'
  | 'Repetition'
  | 'Test Case Run'
  | 'Failure Message'
  | 'Source Code Reference'
  | 'Attachment'
  | 'Expression'
  | 'Test Value'
  | 'Runtime Warning'
  // Since schema version 0.2.0
  | 'Skip Message'
  | 'Expected Failure'

export type TestResult =
  | 'Passed'
  | 'Failed'
  | 'Skipped'
  | 'Expected Failure'
  | 'unknown'

// Since schema version 0.3.0
export interface SourceLocation {
  filePath: string
  lineNumber: number
}

export interface TestNode {
  name: string
  nodeType: TestNodeType
  nodeIdentifier?: string
  nodeIdentifierURL?: string
  details?: string
  duration?: string
  durationInSeconds?: number
  result?: TestResult
  tags?: string[]
  sourceLocation?: SourceLocation
  children?: TestNode[]
}
