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
            .property("streamtype").set("multivalue")
            .property("available").set(false)
    );
}