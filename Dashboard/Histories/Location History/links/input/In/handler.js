function handler(In) {
    this.assertProperty(In, this.props["assetproperty"]);
    if (this.props["eventtimeproperty"])
        this.assertProperty(In, this.props["eventtimeproperty"]);

    var msg = stream.create().message().copyMessage(In);
    this.add(msg);
    this.executeOutputLink("Out", In);
}