// Modern test result format (Xcode 16+)

export interface ModernTestResult {
  devices: ModernDevice[]
  testNodes: ModernTestNode[]
  testPlanConfigurations: ModernConfiguration[]
}

export interface ModernDevice {
  deviceId: string
  deviceName: string
  architecture: string
  modelName: string
  platform?: string
  osVersion: string
  osBuildNumber?: string
}

export interface ModernConfiguration {
  configurationId: string
  configurationName: string
}

export type ModernTestNodeType =
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

export type ModernTestResultStatus =
  | 'Passed'
  | 'Failed'
  | 'Skipped'
  | 'Expected Failure'
  | 'unknown'

export interface ModernTestNode {
  name: string
  nodeType: ModernTestNodeType
  nodeIdentifier?: string
  nodeIdentifierURL?: string
  details?: string
  duration?: string
  durationInSeconds?: number
  result?: ModernTestResultStatus
  tags?: string[]
  children?: ModernTestNode[]
}
