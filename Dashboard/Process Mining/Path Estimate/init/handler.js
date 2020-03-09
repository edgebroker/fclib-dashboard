function handler() {
    var self = this;
    this.setOutputReference("Path Estimate", execRef);

    function execRef() {
        return self.getInputReference("Process Model")().getPathEstimate(self.props["sourcestage"], self.props["targetstage"]);
    }
}