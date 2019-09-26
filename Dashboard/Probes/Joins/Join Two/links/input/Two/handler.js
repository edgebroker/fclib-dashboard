function handler(Two) {
    if (this.props["accumulate"] === true)
        this.msg.body.values[1] += Two.body.values[0];
    else
        this.msg.body.values[1] = Two.body.values[0];
}