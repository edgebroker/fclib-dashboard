function handler(One) {
    if (this.props["accumulate"] === true)
        this.msg.body.values[0] = One.body.values[0];
    else
        this.msg.body.values[0] += One.body.values[0];
}