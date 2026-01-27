import * as core from '@actions/core'
import * as exec from '@actions/exec'

export class XCResultTool {
  constructor(private bundlePath: string) {}

  async getTestResults_Tests(): Promise<string> {
    const args = [
      'xcresulttool',
      'get',
      'test-results',
      'tests',
      '--path',
      this.bundlePath
    ]

    let output = ''
    const options = {
      silent: !core.isDebug(),
      listeners: {
        stdout: (data: Buffer) => {
          output += data.toString()
        }
      }
    }

    await exec.exec('xcrun', args, options)
    return output
  }

  async getLegacyJSON(reference?: string): Promise<string> {
    const args = [
      'xcresulttool',
      'get',
      '--path',
      this.bundlePath,
      '--format',
      'json'
    ]
    if (reference) {
      args.push('--id')
      args.push(reference)
    }

    let output = ''
    const options = {
      silent: !core.isDebug(),
      listeners: {
        stdout: (data: Buffer) => {
          output += data.toString()
        }
      }
    }

    await exec.exec('xcrun', args, options)
    return output
  }
}
