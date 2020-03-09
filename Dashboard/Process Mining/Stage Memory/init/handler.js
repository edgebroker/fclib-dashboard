function handler() {
    var self = this;
    this.setOutputReference("Stage Memory", execRef);

    function execRef() {
        return self.getInputReference("Process Model")().getStageMem(self.props["stage"]);
    }
}