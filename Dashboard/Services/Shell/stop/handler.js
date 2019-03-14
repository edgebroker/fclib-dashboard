function handler() {
    stream.output(this.metaRegistryTopic).send(
        stream.create()
            .message()
            .textMessage()
            .property("registryrequest").set(true)
            .property("streamname").set(this.streamname)
            .property("available").set(false)
    );
    stream.output(this.registryTopic).send(
        stream.create()
            .message()
            .message()
            .property("registryrequest").set(true)
            .property("streamname").set(this.streamname)
            .property("streamtype").set("service")
            .property("available").set(false)
    );
    if (this.parentStream) {
        stream.output(this.parentStream).send(
            stream.create().message().message()
                .property("registryrequest").set(true)
                .property("operation").set("remove")
                .property("command").set(this.props["shellname"])
                .property("shell").set(true)
        );
    }
}