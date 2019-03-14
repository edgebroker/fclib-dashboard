function handler(Request) {
    if (!this.assertProperty(Request, this.props["correlationproprequest"]))
        return;
    this.store(Request.property(this.props["correlationproprequest"]).value().toObject());
}