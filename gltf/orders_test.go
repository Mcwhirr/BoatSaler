package main

import "testing"

func TestBuildSalesOrderRequiresCustomerContact(t *testing.T) {
	_, err := buildSalesOrder(salesOrderCreateInput{
		ModelID:      "Cabnet",
		ModelLabel:   "测试船型",
		CustomerName: "王先生",
	})
	if err == nil {
		t.Fatal("buildSalesOrder succeeded without customer contact, want error")
	}
}

func TestBuildSalesOrderStoresCustomerInfo(t *testing.T) {
	order, err := buildSalesOrder(salesOrderCreateInput{
		ModelID:         "Cabnet",
		ModelLabel:      "测试船型",
		CustomerName:    " 王先生 ",
		CustomerContact: " 13800138000 ",
	})
	if err != nil {
		t.Fatalf("buildSalesOrder returned error: %v", err)
	}

	if order.CustomerName != "王先生" {
		t.Fatalf("CustomerName = %q, want %q", order.CustomerName, "王先生")
	}
	if order.CustomerContact != "13800138000" {
		t.Fatalf("CustomerContact = %q, want %q", order.CustomerContact, "13800138000")
	}
}
