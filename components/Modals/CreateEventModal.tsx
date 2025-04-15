import { useState } from "react";
import {
  Modal,
  TextInput,
  Textarea,
  Group,
  Button,
  Stack,
  Stepper,
  NumberInput,
  Paper,
  CloseButton,
  Badge,
} from "@mantine/core";
import { DbObjectType, Event } from "@/types";
import { formRootRule, isNotEmpty, useForm } from "@mantine/form";

interface CreateEventModalProps {
  opened: boolean;
  onClose: () => void;
  onCreate: (event: Event) => void;
}

export default function CreateEventModal({
  opened,
  onClose,
  onCreate,
}: CreateEventModalProps) {
  const form = useForm({
    mode: "uncontrolled",
    initialValues: {
      title: "",
      description: "",
      mainImage: "",
      eventLocation: {
        country: "",
        city: "",
        street: "",
        location: "",
      },
      dates: [
        {
          uuid: crypto.randomUUID(),
          start: "",
          end: "",
          timeLine: [{ time: "", description: "" }],
          price: undefined,
        },
      ],
      images: [""],
    },
    validate: {
      title: (value) => (value.trim() ? null : "Title is required"),
      description: (value) => (value.trim() ? null : "Description is required"),
      mainImage: (value) =>
        value.trim() ? null : "Display image URL is required",
      eventLocation: {
        country: (value) => (value.trim() ? null : "Country is required"),
        city: (value) => (value.trim() ? null : "City is required"),
        street: (value) => (value.trim() ? null : "Street address is required"),
        location: (value) =>
          value.trim() ? null : "Event building or location is required",
      },
      dates: (value) => {
        if (value.length === 0) {
          return "At least one date entry is required";
        }
        for (const date of value) {
          console.log(date);
          if (!date.start || !date.end) {
            return "Start and end times are required";
          }
          if (new Date(date.start) >= new Date(date.end)) {
            return "Start date must be before end date";
          }
          if (date.timeLine.length < 2) {
            return "At least 2 timeline entries are required (start and end)";
          }
          for (const entry of date.timeLine) {
            if (!entry.time || !entry.description) {
              return "Time and description are required for each timeline entry";
            }
          }
        }
        return null;
      },
    },

    // validate: (values) => {
    //   if (active === 0) {
    //     return {
    //       title: values.title.trim() ? null : "Title is required",
    //       description: values.description.trim()
    //         ? null
    //         : "Description is required",
    //       mainImage: values.mainImage.trim()
    //         ? null
    //         : "Display image URL is required",
    //     };
    //   }
    //   if (active === 1) {
    //     return {
    //       eventLocation: {
    //         country: values.eventLocation.country.trim()
    //           ? null
    //           : "Country is required",
    //         city: values.eventLocation.city.trim() ? null : "City is required",
    //         street: values.eventLocation.street.trim()
    //           ? null
    //           : "Street address is required",
    //         location: values.eventLocation.location.trim()
    //           ? null
    //           : "Event building or location is required",
    //       },
    //     };
    //   }
    //   if (active === 2) {
    //     return {};
    //   }

    //   return {};
    // },
  });

  const [active, setActive] = useState(0);
  const nextStep = () => {
    setActive((current) => current + 1);
    // setActive((current) => {
    //   if (form.validate().hasErrors) {
    //     return current;
    //   }
    //   return current < 2 ? current + 1 : current;
    // });
  };
  const prevStep = () =>
    setActive((current) => (current > 0 ? current - 1 : current));

  const handleCreate = () => {
    form.validate();
    if (form.isValid()) {
      onCreate({
        ...form.values,
        uuid: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        type: DbObjectType.EVENT,
      });
      onClose();
    }
  };

  const dates = form.getValues().dates.map((date, index) => (
    <Paper key={date.uuid} p={"10"} radius="md" withBorder>
      <CloseButton
        color="red"
        onClick={() => form.removeListItem("dates", index)}
      />
      <Group grow>
        <TextInput
          label="Start Time"
          type="datetime-local"
          key={form.key(`dates.${index}.start`)}
          {...form.getInputProps(`dates.${index}.start`)}
        />
        <TextInput
          label="End Time"
          type="datetime-local"
          key={form.key(`dates.${index}.end`)}
          {...form.getInputProps(`dates.${index}.end`)}
        />
      </Group>
      <NumberInput
        label="price"
        placeholder="Enter ticket price"
        key={form.key(`dates.${index}.price`)}
        {...form.getInputProps(`dates.${index}.price`)}
      />

      <Group>
        {form
          .getValues()
          .dates[index].timeLine.map((timeLineEntry, timeIndex) => (
            <Paper key={timeIndex} p={"10"} radius="md" withBorder w={150}>
              <CloseButton
                color="red"
                onClick={() =>
                  form.removeListItem(`dates.${index}.timeLine`, timeIndex)
                }
              />
              <TextInput
                label="Time"
                type="time"
                {...form.getInputProps(
                  `dates.${index}.timeLine.${timeIndex}.time`,
                )}
              />
              <TextInput
                label="Description"
                placeholder="Enter description"
                {...form.getInputProps(
                  `dates.${index}.timeLine.${timeIndex}.description`,
                )}
              />
            </Paper>
          ))}
      </Group>
      <Button
        variant="default"
        onClick={() => {
          form.insertListItem(`dates.${index}.timeLine`, {
            time: "",
            description: "Starting time",
          });
        }}
      >
        Add timeline entry
      </Button>
    </Paper>
  ));

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Create New Event"
      size={"auto"}
    >
      <Stepper active={active} onStepClick={setActive}>
        {/* ====================== Event info ==================== */}
        <Stepper.Step
          color="yellow"
          label="Event info"
          description="Give the title, content and a display image."
        >
          <Stack>
            <TextInput
              label="Title"
              placeholder="Enter event title"
              key={form.key("title")}
              {...form.getInputProps("title")}
            />
            <Textarea
              label="Description"
              placeholder="Enter event description"
              key={form.key("description")}
              {...form.getInputProps("description")}
            />
            <TextInput
              label="Image URL"
              placeholder="Enter display image URL"
              key={form.key("mainImage")}
              {...form.getInputProps("mainImage")}
            />
          </Stack>
        </Stepper.Step>

        {/* ====================== Event location ==================== */}

        <Stepper.Step
          color="yellow"
          label="Location"
          description="Set the event location"
        >
          <Stack>
            <TextInput
              label="Country"
              placeholder="Enter country"
              key={form.key("eventLocation.country")}
              {...form.getInputProps("eventLocation.country")}
            />
            <TextInput
              label="City"
              placeholder="Enter city"
              key={form.key("eventLocation.city")}
              {...form.getInputProps("eventLocation.city")}
            />
            <TextInput
              label="Street"
              placeholder="Enter street address"
              key={form.key("eventLocation.street")}
              {...form.getInputProps("eventLocation.street")}
            />
            <TextInput
              label="Location"
              placeholder="Enter event building or location"
              key={form.key("eventLocation.location")}
              {...form.getInputProps("eventLocation.location")}
            />
          </Stack>
        </Stepper.Step>

        {/* ====================== Event dates ==================== */}

        <Stepper.Step
          color="yellow"
          label="Set the date"
          description="Set the event date(s)"
        >
          <Stack>
            {dates}
            <Button
              color="yellow"
              onClick={() => {
                form.insertListItem("dates", {
                  uuid: crypto.randomUUID(),
                  start: "",
                  end: "",
                  timeLine: [
                    {
                      time: "",
                      description: "Starting time",
                    },
                  ],
                  price: undefined,
                });
              }}
            >
              Add Date Entry
            </Button>
          </Stack>
        </Stepper.Step>
        <Stepper.Completed>
          {/* {!form.isValid() && } */}
          {Object.keys(form.errors).length > 0 && (
            <Stack>
              {Object.entries(form.errors).map(([field, error]) => (
                <Badge key={field} color="red" variant="filled">
                  {error}
                </Badge>
              ))}
            </Stack>
          )}
        </Stepper.Completed>
      </Stepper>

      <Group justify="center" mt="xl">
        <Button variant="default" onClick={prevStep}>
          Back
        </Button>
        <Button color="red" onClick={active === 3 ? handleCreate : nextStep}>
          {active === 3 ? "Create Event" : "Next step"}
        </Button>
      </Group>
    </Modal>
  );
}
