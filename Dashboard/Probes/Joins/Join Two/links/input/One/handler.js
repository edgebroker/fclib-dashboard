function handler(One) {
    if (this.props["accumulate"] === true)
        this.cnt1 += One.body.values[0];
    else
        this.cnt1 = One.body.values[0];
}