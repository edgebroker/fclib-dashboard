function handler(Reply) {
    if (!this.assertProperty(Reply, this.props["correlationpropreply"]))
        return;
    stream.memory(this.compid+"_messages").index(this.props["correlationproprequest"]).remove(Reply.property(this.props["correlationpropreply"]).value().toObject());
}