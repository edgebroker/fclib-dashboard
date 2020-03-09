function handler(In) {
    if (this.getInputReference("Process Model")().stageDefined(this.props["stage"]))
        this.executeOutputLink("Yes", In);
    else
        this.executeOutputLink("No", In);
}