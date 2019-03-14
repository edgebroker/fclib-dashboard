function handler(Request) {
    if (!this.assertProperty(Request, this.props["correlationproprequest"]))
        return;
    stream.memory(this.compid+"_messages").add(Request);
}