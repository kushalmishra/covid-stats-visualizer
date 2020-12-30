import { LightningElement, api } from 'lwc';

export default class TotalCard extends LightningElement {
    @api label;
    @api value;
    @api countColor;

    get colorStyle() {
        return `color: ${this.countColor};
            font-size: large;`;
    }
}