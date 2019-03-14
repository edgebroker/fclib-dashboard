function handler(Reply) {
    if (!this.assertProperty(Reply, this.props["correlationpropreply"]))
        return;
    this.deactivated(Reply.property(this.props["correlationpropreply"]).value().toObject());
}