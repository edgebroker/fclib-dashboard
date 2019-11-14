function handler(In) {
    if (!this.assertProperty(In, "id"))
        return;
    if (!this.assertProperty(In, "label"))
        return;
    if (!this.assertProperty(In, "long"))
        return;
    if (!this.assertProperty(In, "lat"))
        return;
    if (!this.assertProperty(In, "timestamp"))
        return;

    var msg = stream.create().message().copyMessage(In);
    this.add(msg);
    this.executeOutputLink("Out", In);
}