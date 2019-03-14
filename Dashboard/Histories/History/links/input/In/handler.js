function handler(In) {
    var body = In;
    var msg = stream.create().message().message().persistent();
    msg.property("time").set(body.body.time);
    for (var i = 0; i < this.nvalues; i++)
        msg.property("value" + i).set(body.body.values[i]);
    this.lastSecondUpdate = msg;
    stream.memory(this.memory_sec).add(msg);
}