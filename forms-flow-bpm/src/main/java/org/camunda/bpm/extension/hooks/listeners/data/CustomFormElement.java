package org.camunda.bpm.extension.hooks.listeners.data;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class CustomFormElement {
	private String op;
	private String path;
	private String value;

	public CustomFormElement(String elementId, String value) {
		this.op = "replace";
		this.path = "/data/" + elementId + "/id";
		this.value = value;
	}

}
