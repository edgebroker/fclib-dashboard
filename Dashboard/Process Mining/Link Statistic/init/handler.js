function handler() {
    var self = this;
    this.setOutputReference("Link Statistic", execRef);

    function execRef() {
        return self.getInputReference("Process Model")().getLinkStats(self.props["sourcestage"], self.props["targetstage"]);
    }
}