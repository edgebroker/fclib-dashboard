function handler(In) {
    stream.memoryGroup(this.compid+"_messages").add(In);
    this.sendUpdate(stream.output(this.streamname), In);
}