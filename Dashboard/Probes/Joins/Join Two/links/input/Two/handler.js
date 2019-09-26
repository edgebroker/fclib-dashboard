function handler(Two) {
    if (this.props["accumulate"] === true)
        this.cnt2 += Two.body.values[0];
    else
        this.cnt2 = Two.body.values[0];
}