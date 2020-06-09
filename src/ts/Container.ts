export class Container {
  id: string;
  name: string;
  entrypoint: string;
  mountedAt: string;
  mountedInfo: string;
  ports: string;
  image: string;
  size: string;

  constructor(dockerLine: { split: (arg0: RegExp) => { filter: (arg0: (str: { trim: () => { length: number; }; }) => boolean) => void; }; }) {
    const container: string[number] = this.decodeLineInfo(dockerLine);

    this.id           = container[0] || 'no id found'
    this.name         = container[1] || 'no name found'
    this.entrypoint   = container[2] || 'no entry point found'
    this.mountedAt    = container[3] || 'no mounted date found'
    this.mountedInfo  = container[4] || 'no mounted info found'

    if (this.isUp()) {
      this.ports = container[5] || 'no ports found'
      this.image = container[6] || 'no image found'
      this.size  = container[7] || 'no size found'
    } else {
      this.ports = ''
      this.image = container[5] || 'no image found'
      this.size  = container[6] || 'no size found'
    }
  }

  decodeLineInfo(line: { split: (arg0: RegExp) => { filter: (arg0: (str: { trim: () => { length: number; }; }) => boolean) => void; }; }) {
    return line.split(/(\s{2,})/).filter((str: { trim: () => { length: number; }; }) => str.trim().length > 0)
  }

  getLivingInfo() {
    if (this.mountedInfo.includes('Up')) return 'up'
    else if (this.mountedInfo.includes('Restarting')) return 'restarting'
    else return 'down'
  }

  isUp() {
    return this.mountedInfo.includes('Up')
  }
}

module.exports = Container
