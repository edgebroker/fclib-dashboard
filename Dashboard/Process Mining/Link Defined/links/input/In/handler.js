function handler(In) {
    if (this.getInputReference("Process Model")().linkDefined(this.props["sourcestage"], this.props["targetstage"]))
        this.executeOutputLink("Yes", In);
    else
        this.executeOutputLink("No", In);
}