import * as core from '@actions/core'
import * as exec from '@actions/exec'
import {getXcodeVersion} from '../xcode'

export class XCResultTool {
  constructor(private bundlePath: string) {}

  async getTestResults_Tests(): Promise<string> {
    return await this.run([
      'get',
      'test-results',
      'tests',
      '--path',
      this.bundlePath
    ])
  }

  async getBuildResults(): Promise<string> {
    return await this.run(['get', 'build-results', '--path', this.bundlePath])
  }

  async getLegacyJSON(reference?: string): Promise<string> {
    const args = ['get', '--path', this.bundlePath, '--format', 'json']
    if (reference) {
      args.push('--id')
      args.push(reference)
    }
    if ((await getXcodeVersion()) >= 16) {
      args.push('--legacy')
    }
    return await this.run(args)
  }

  private async run(args: string[]): Promise<string> {
    let output = ''
    const options = {
      silent: !core.isDebug(),
      listeners: {
        stdout: (data: Buffer) => {
          output += data.toString()
        }
      }
    }

    await exec.exec('xcrun', ['xcresulttool', ...args], options)
    return output
  }
}
