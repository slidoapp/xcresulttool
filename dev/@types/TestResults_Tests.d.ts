// Modern test result format (Xcode 16+)

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

export type TestResult =
  | 'Passed'
  | 'Failed'
  | 'Skipped'
  | 'Expected Failure'
  | 'unknown'

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
  children?: TestNode[]
}
