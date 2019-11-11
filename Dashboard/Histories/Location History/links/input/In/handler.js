function handler(In) {
    this.assertProperty(In, this.props["assetproperty"]);

    var msg = stream.create().message().copyMessage(In);
    this.add(msg);
    this.executeOutputLink("Out", In);
}