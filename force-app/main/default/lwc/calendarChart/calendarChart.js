import { LightningElement, api } from 'lwc';
import { loadScript } from 'lightning/platformResourceLoader';
import D3 from '@salesforce/resourceUrl/d3';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

export default class CalendarChart extends LightningElement {
	@api
	yearsData = [];

	@api
	fillBy = 'confirmToday';

	@api
	color = 'interpolateYlOrRd';

	@api
	maxScale = 25000;

	svgWidth = 1000;
	svgHeight = 150;

	d3Initialized = false;

	renderedCallback() {
		if (!this.d3Initialized) {
			Promise.all([
				loadScript(this, D3 + '/d3.min.js'),
			])
				.then(() => {
					this.d3Initialized = true;
				})
				.catch((error) => {
					this.dispatchEvent(
						new ShowToastEvent({
							title: 'Error loading D3',
							variant: 'error'
						})
					);
				});
		}
		this.drawCalendar();
	}

	async drawCalendar() {
		const svg = d3.select(this.template.querySelector('svg.calendarChart'));
		const weekday = 'sunday';
		const height = 119;
		const cellSize = 17;
		var years = this.yearsData;
		var max = this.maxScale;
		const color = d3.scaleSequential(d3[this.color]).domain([0, max]);

		var timeWeek = weekday === "sunday" ? d3.utcSunday : d3.utcMonday;
		var countDay = weekday === "sunday" ? i => i : i => (i + 6) % 7;
		var formatDay = i => "SMTWTFS"[i];
		var formatMonth = d3.utcFormat("%b");
		var pathMonth = function(t) {
			const n = weekday === "weekday" ? 5 : 7;
			const d = Math.max(0, Math.min(n, countDay(t.getUTCDay())));
			const w = timeWeek.count(d3.utcYear(t), t);
			return `${d === 0 ? `M${w * cellSize},0`
				: d === n ? `M${(w + 1) * cellSize},0`
				: `M${(w + 1) * cellSize},0V${d * cellSize}H${w * cellSize}`}V${n * cellSize}`;
		}

		const year = svg.selectAll("g")
			.data(years)
			.join("g")
			.attr("transform", (d, i) => `translate(40.5,${height * i + cellSize * 1.5})`);
	  
		year.append("text")
			.attr("x", -5)
			.attr("y", -5)
			.attr("font-weight", "bold")
			.attr("text-anchor", "end")
			.text(([key]) => key);
	  
		year.append("g")
			.attr("text-anchor", "end")
			.selectAll("text")
			.data(weekday === "weekday" ? d3.range(1, 6) : d3.range(7))
			.join("text")
			.attr("x", -5)
			.attr("y", i => (countDay(i) + 0.5) * cellSize)
			.attr("dy", "0.31em")
			.text(formatDay);

		year.append("g")
			.selectAll("rect")
			.data(weekday === "weekday"
			? ([, values]) => values.filter(d => ![0, 6].includes(new Date(d.Date).getUTCDay()))
			: ([, values]) => values)
			.join("rect")
			.attr("width", cellSize - 1)
			.attr("height", cellSize - 1)
			.attr("x", d => timeWeek.count(d3.utcYear(new Date(d.Date)), new Date(d.Date)) * cellSize + 0.5)
			.attr("y", d => countDay(new Date(d.Date).getUTCDay()) * cellSize + 0.5)
			.attr("fill", d => color(d[this.fillBy]))
			.append("title")
			.text(
				d => `Date: ${new Date(d.Date).toDateString()} \nCases: ${d[this.fillBy]}`
			);
	  
		const month = year.append("g")
			.selectAll("g")
			.data(([, values]) => d3.utcMonths(d3.utcMonth(new Date(values[0].Date)), new Date(values[values.length - 1].Date)))
			.join("g");

		month.filter((d, i) => i).append("path")
			.attr("fill", "none")
			.attr("stroke", "#fff")
			.attr("stroke-width", 5)
			.attr("d", pathMonth);

		month.append("text")
			.attr("x", d => timeWeek.count(d3.utcYear(d), timeWeek.ceil(d)) * cellSize + 2)
			.attr("y", -5)
			.text(formatMonth);
	}
}