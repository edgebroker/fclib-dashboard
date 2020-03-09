function handler() {
    var self = this;
    this.setOutputReference("Stage Statistic", execRef);

    function execRef() {
        return self.getInputReference("Process Model")().getStageStats(self.props["stage"]);
    }
}